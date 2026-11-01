import { describe, expect, test } from 'bun:test'
import {
  type Address,
  type Hash,
  type Hex,
  createPublicClient,
  custom,
  hexToBigInt,
  keccak256,
  numberToHex,
  toHex,
} from 'viem'

import {
  CONTRACTS_SCAN_CONCURRENCY,
  type ContractsScanCursor,
  getContracts,
  runCoalesced,
} from './getContracts'

////////////////////////////////////////////////////////////////////////
// A fake chain behind a canned JSON-RPC transport

type FakeTx = { hash: Hash; creates?: Address }
type FakeBlock = { hash: Hash; txs: FakeTx[] }
type FakeChain = FakeBlock[] // Indexed by block number.

const id = (...parts: (string | number)[]) => keccak256(toHex(parts.join('-')))
const addressOf = (...parts: (string | number)[]) =>
  `0x${id('address', ...parts).slice(26)}` as Address

type TxPlan = (blockNumber: number) => { creates: boolean }[]

/**
 * By default: every 10th block is empty, every 7th has 3 transactions, the
 * others have one, and the first transaction of every 97th block deploys a
 * contract.
 */
const defaultPlan: TxPlan = (n) => {
  if (n % 10 === 0) return []
  const count = n % 7 === 0 ? 3 : 1
  return Array.from({ length: count }, (_, i) => ({
    creates: i === 0 && n % 97 === 0,
  }))
}

function buildChain(
  height: number,
  { seed = 'a', plan = defaultPlan }: { seed?: string; plan?: TxPlan } = {},
): FakeChain {
  return Array.from({ length: height + 1 }, (_, n) => ({
    hash: id('block', seed, n),
    txs:
      n === 0
        ? []
        : plan(n).map(({ creates }, i) => ({
            hash: id('tx', seed, n, i),
            creates: creates ? addressOf(seed, n, i) : undefined,
          })),
  }))
}

const createdAddresses = (chain: FakeChain, from = 1, to = chain.length - 1) =>
  chain
    .slice(from, to + 1)
    .flatMap((block) => block.txs.map((tx) => tx.creates))
    .filter((address): address is Address => Boolean(address))
const nonEmptyBlocks = (chain: FakeChain, from = 1, to = chain.length - 1) =>
  chain.slice(from, to + 1).filter((block) => block.txs.length > 0).length
const txCount = (chain: FakeChain, from = 1, to = chain.length - 1) =>
  chain.slice(from, to + 1).reduce((sum, block) => sum + block.txs.length, 0)

const codeOf = (address: Address) => `0x6080${address.slice(2, 10)}` as Hex

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message)
  }
}

type BlockReceiptsBehavior =
  | 'supported'
  | { code: number; message: string }
  | 'broken'

function createFakeNode(
  chain: FakeChain,
  {
    blockReceipts = 'supported',
    failOnBlock,
    emptyCode = [],
  }: {
    blockReceipts?: BlockReceiptsBehavior
    failOnBlock?: number
    emptyCode?: Address[]
  } = {},
) {
  const node = {
    chain,
    requests: [] as { method: string; params: unknown[] }[],
    inflight: 0,
    maxInflight: 0,
    count: (method: string) =>
      node.requests.filter((request) => request.method === method).length,
    /** Block numbers asked for with `eth_getBlockByNumber`. */
    blocksFetched: () =>
      node.requests
        .filter((request) => request.method === 'eth_getBlockByNumber')
        .map((request) => Number(hexToBigInt(request.params[0] as Hex))),
    client: undefined as unknown as ReturnType<typeof createPublicClient>,
  }

  const receipt = (blockNumber: number, tx: FakeTx, index: number) => ({
    blockHash: node.chain[blockNumber].hash,
    blockNumber: numberToHex(blockNumber),
    contractAddress: tx.creates ?? null,
    cumulativeGasUsed: '0x5208',
    effectiveGasPrice: '0x1',
    from: addressOf('sender'),
    gasUsed: '0x5208',
    logs: [],
    logsBloom: `0x${'00'.repeat(256)}`,
    status: '0x1',
    to: tx.creates ? null : addressOf('recipient'),
    transactionHash: tx.hash,
    transactionIndex: numberToHex(index),
    type: '0x2',
  })

  async function handle(method: string, params: unknown[]) {
    switch (method) {
      case 'eth_blockNumber':
        return numberToHex(node.chain.length - 1)
      case 'eth_getBlockByNumber': {
        const n = Number(hexToBigInt(params[0] as Hex))
        if (n === failOnBlock) throw new RpcError(-32603, 'Internal error')
        const block = node.chain[n]
        if (!block) return null
        return {
          hash: block.hash,
          number: numberToHex(n),
          transactions: block.txs.map((tx) => tx.hash),
        }
      }
      case 'eth_getBlockReceipts': {
        if (blockReceipts === 'broken') return null
        if (blockReceipts !== 'supported')
          throw new RpcError(blockReceipts.code, blockReceipts.message)
        const n = Number(hexToBigInt(params[0] as Hex))
        return node.chain[n].txs.map((tx, i) => receipt(n, tx, i))
      }
      case 'eth_getTransactionReceipt': {
        for (const [n, block] of node.chain.entries()) {
          const index = block.txs.findIndex((tx) => tx.hash === params[0])
          if (index >= 0) return receipt(n, block.txs[index], index)
        }
        return null
      }
      case 'eth_getCode':
        return emptyCode.includes(params[0] as Address)
          ? '0x'
          : codeOf(params[0] as Address)
      default:
        throw new RpcError(-32601, `Method ${method} not found`)
    }
  }

  node.client = createPublicClient({
    transport: custom(
      {
        async request({ method, params }: { method: string; params?: any }) {
          node.requests.push({ method, params: params ?? [] })
          node.inflight++
          node.maxInflight = Math.max(node.maxInflight, node.inflight)
          try {
            // Give requests a chance to overlap.
            await new Promise((resolve) => setTimeout(resolve, 0))
            return await handle(method, params ?? [])
          } finally {
            node.inflight--
          }
        },
      },
      { retryCount: 0 },
    ),
  })
  return node
}

const cursorAt = (
  chain: FakeChain,
  blockNumber: number,
  fromBlock = 1n,
): ContractsScanCursor => ({
  fromBlock,
  blockNumber: BigInt(blockNumber),
  blockHash: chain[blockNumber].hash,
})

////////////////////////////////////////////////////////////////////////

describe('getContracts', () => {
  test('scans a 2,000 block range within the request limit', async () => {
    const chain = buildChain(2_000)
    const node = createFakeNode(chain)

    const { contracts, cursor, mode } = await getContracts(node.client, {
      fromBlock: 1n,
    })

    expect(mode).toBe('full')
    expect(node.maxInflight).toBeGreaterThan(1)
    expect(node.maxInflight).toBeLessThanOrEqual(CONTRACTS_SCAN_CONCURRENCY)
    expect(CONTRACTS_SCAN_CONCURRENCY).toBeLessThanOrEqual(8)

    // Finds every deployed contract, in block order.
    const expected = createdAddresses(chain)
    expect(expected.length).toBeGreaterThan(10)
    expect(contracts.map((contract) => contract.address)).toEqual(expected)
    expect(contracts[0]).toMatchObject({
      address: expected[0],
      bytecode: codeOf(expected[0]),
      receipt: {
        contractAddress: expected[0],
        blockNumber: 97n,
        status: 'success',
        transactionIndex: 0,
      },
    })
    expect(cursor).toEqual(cursorAt(chain, 2_000))

    // One receipts request per block with transactions, none for empty
    // blocks, and bytecode only for deployments.
    expect(node.count('eth_getBlockByNumber')).toBe(2_000)
    expect(node.count('eth_getBlockReceipts')).toBe(nonEmptyBlocks(chain))
    expect(node.count('eth_getTransactionReceipt')).toBe(0)
    expect(node.count('eth_getCode')).toBe(expected.length)
  })

  test('honours a custom concurrency', async () => {
    const node = createFakeNode(buildChain(300))
    await getContracts(node.client, { fromBlock: 1n, concurrency: 3 })
    expect(node.maxInflight).toBe(3)
  })

  test('reports contracts without code as null bytecode', async () => {
    const chain = buildChain(200)
    const [first, second] = createdAddresses(chain)
    const node = createFakeNode(chain, { emptyCode: [first] })

    const { contracts } = await getContracts(node.client, { fromBlock: 1n })

    expect(contracts.map((contract) => contract.bytecode)).toEqual([
      null,
      codeOf(second),
    ])
  })

  test('scans from the given block and up to the given block', async () => {
    const chain = buildChain(500)
    const node = createFakeNode(chain)

    const { contracts, cursor } = await getContracts(node.client, {
      fromBlock: 100n,
      toBlock: 300n,
    })

    expect(node.count('eth_blockNumber')).toBe(0)
    expect(node.blocksFetched()).toHaveLength(201)
    expect(contracts.map((contract) => contract.address)).toEqual(
      createdAddresses(chain, 100, 300),
    )
    expect(cursor).toEqual(cursorAt(chain, 300, 100n))
  })

  test('returns nothing for an empty range', async () => {
    const node = createFakeNode(buildChain(10))
    const result = await getContracts(node.client, { fromBlock: 11n })
    expect(result).toEqual({ contracts: [], cursor: null, mode: 'full' })
    expect(node.blocksFetched()).toEqual([])
  })

  describe('receipts', () => {
    // Blocks with enough transactions to blow the limit if they were all asked
    // for at once.
    const plan: TxPlan = (n) =>
      Array.from({ length: n % 5 === 0 ? 40 : 2 }, (_, i) => ({
        creates: i === 0 && n % 11 === 0,
      }))

    test.each([
      ['method not found', { code: -32601, message: 'Method not found' }],
      ['method not supported', { code: -32004, message: 'Not supported' }],
      [
        'hardhat',
        {
          code: -32000,
          message:
            'The method eth_getBlockReceipts does not exist/is not available',
        },
      ],
    ])(
      'falls back to one receipt per transaction when %s',
      async (_, error) => {
        const chain = buildChain(60, { plan })
        const node = createFakeNode(chain, { blockReceipts: error })

        const first = await getContracts(node.client, { fromBlock: 1n })

        expect(first.contracts.map((contract) => contract.address)).toEqual(
          createdAddresses(chain),
        )
        expect(first.contracts[0].receipt.blockNumber).toBe(11n)
        expect(node.count('eth_getTransactionReceipt')).toBe(txCount(chain))
        // Asked once, even though 8 blocks were being scanned at the time.
        expect(node.count('eth_getBlockReceipts')).toBe(1)
        expect(node.maxInflight).toBeLessThanOrEqual(CONTRACTS_SCAN_CONCURRENCY)

        // Remembered for the client: later scans don't ask again.
        const later = await getContracts(node.client, { fromBlock: 1n })
        expect(later.contracts).toEqual(first.contracts)
        expect(node.count('eth_getBlockReceipts')).toBe(1)
        expect(node.count('eth_getTransactionReceipt')).toBe(2 * txCount(chain))
      },
    )

    test('uses the same receipts either way', async () => {
      const chain = buildChain(200)
      const withBlockReceipts = await getContracts(
        createFakeNode(chain).client,
        { fromBlock: 1n },
      )
      const withoutBlockReceipts = await getContracts(
        createFakeNode(chain, {
          blockReceipts: { code: -32601, message: 'Method not found' },
        }).client,
        { fromBlock: 1n },
      )
      expect(withoutBlockReceipts).toEqual(withBlockReceipts)
    })

    test('does not mistake other failures for a missing method', async () => {
      const chain = buildChain(60, { plan })
      const node = createFakeNode(chain, {
        blockReceipts: { code: -32000, message: 'database is locked' },
      })

      await expect(
        getContracts(node.client, { fromBlock: 1n }),
      ).rejects.toThrow()
      expect(node.count('eth_getTransactionReceipt')).toBe(0)
    })

    test('asks for receipts one by one when a node answers badly', async () => {
      const chain = buildChain(100)
      const node = createFakeNode(chain, { blockReceipts: 'broken' })

      const { contracts } = await getContracts(node.client, { fromBlock: 1n })

      expect(contracts.map((contract) => contract.address)).toEqual(
        createdAddresses(chain),
      )
      // Still asked for every block: it may only have been that one.
      expect(node.count('eth_getBlockReceipts')).toBe(nonEmptyBlocks(chain))
    })
  })

  describe('incremental scans', () => {
    test('only scans blocks after the cursor', async () => {
      // Five new blocks, the third one deploys a contract.
      const plan: TxPlan = (n) =>
        n <= 100 ? defaultPlan(n) : [{ creates: n === 103 }]
      const chain = buildChain(100, { plan })
      const node = createFakeNode(chain)
      const first = await getContracts(node.client, { fromBlock: 1n })
      expect(first.cursor).toEqual(cursorAt(chain, 100))

      node.chain = buildChain(105, { plan })
      node.requests.length = 0
      const second = await getContracts(node.client, {
        fromBlock: 1n,
        cursor: first.cursor,
      })

      expect(second.mode).toBe('incremental')
      // The block of the cursor is looked at (to check it is still the same),
      // then only the new blocks are fetched.
      expect(node.blocksFetched()).toEqual([100, 101, 102, 103, 104, 105])
      expect(node.count('eth_getBlockReceipts')).toBe(5)
      expect(node.count('eth_getCode')).toBe(1)
      expect(second.contracts.map((contract) => contract.address)).toEqual([
        node.chain[103].txs[0].creates as Address,
      ])
      expect(second.cursor).toEqual(cursorAt(node.chain, 105))
    })

    test('does nothing when there are no new blocks', async () => {
      const chain = buildChain(50)
      const node = createFakeNode(chain)
      const cursor = cursorAt(chain, 50)

      const result = await getContracts(node.client, { fromBlock: 1n, cursor })

      expect(result).toEqual({ contracts: [], cursor, mode: 'incremental' })
      expect(node.blocksFetched()).toEqual([50])
    })

    test('scans in order and reports progress along the way', async () => {
      const chain = buildChain(1_000)
      const node = createFakeNode(chain)
      const progress: { found: Address[]; cursor: ContractsScanCursor }[] = []

      const { contracts, cursor } = await getContracts(node.client, {
        fromBlock: 1n,
        checkpointBlocks: 300,
        onProgress: ({ contracts, cursor }) => {
          progress.push({ found: contracts.map((c) => c.address), cursor })
        },
      })

      expect(progress.map((p) => p.cursor.blockNumber)).toEqual([
        300n,
        600n,
        900n,
        1_000n,
      ])
      expect(progress.flatMap((p) => p.found)).toEqual(
        contracts.map((contract) => contract.address),
      )
      expect(progress.at(-1)?.cursor).toEqual(cursor as ContractsScanCursor)
      expect(cursor).toEqual(cursorAt(chain, 1_000))
    })

    test('keeps the progress made before a failure', async () => {
      const chain = buildChain(100)
      const node = createFakeNode(chain, { failOnBlock: 65 })
      const progress: ContractsScanCursor[] = []

      await expect(
        getContracts(node.client, {
          fromBlock: 1n,
          checkpointBlocks: 20,
          onProgress: ({ cursor }) => {
            progress.push(cursor)
          },
        }),
      ).rejects.toThrow()

      expect(progress.map((cursor) => cursor.blockNumber)).toEqual([
        20n,
        40n,
        60n,
      ])

      // Nothing that was still queued behind the failure gets requested.
      const requests = node.requests.length
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(node.requests).toHaveLength(requests)
      expect(node.inflight).toBe(0)

      // The next scan carries on from the last checkpoint.
      const healthy = createFakeNode(chain)
      const resumed = await getContracts(healthy.client, {
        fromBlock: 1n,
        cursor: progress.at(-1),
      })
      expect(resumed.mode).toBe('incremental')
      expect(healthy.blocksFetched()).toEqual(
        Array.from({ length: 41 }, (_, i) => i + 60),
      )
    })
  })

  describe('chain resets', () => {
    test('rescans everything when the chain is shorter than the cursor', async () => {
      const old = buildChain(120)
      const cursor = cursorAt(old, 120)
      // Restarted node, a few blocks further than it was at the start.
      const chain = buildChain(40, { seed: 'b' })
      const node = createFakeNode(chain)

      const result = await getContracts(node.client, { fromBlock: 1n, cursor })

      expect(result.mode).toBe('full')
      expect(node.blocksFetched().sort((a, b) => a - b)).toEqual(
        Array.from({ length: 40 }, (_, i) => i + 1),
      )
      expect(result.contracts.map((contract) => contract.address)).toEqual(
        createdAddresses(chain),
      )
      expect(result.cursor).toEqual(cursorAt(chain, 40))
    })

    test('rescans everything when the block at the cursor changed', async () => {
      // A different chain that grew past the cursor.
      const old = buildChain(80)
      const cursor = cursorAt(old, 80)
      const chain = buildChain(200, { seed: 'b' })
      const node = createFakeNode(chain)

      const result = await getContracts(node.client, { fromBlock: 1n, cursor })

      expect(result.mode).toBe('full')
      expect(node.blocksFetched()).toContain(1)
      expect(node.blocksFetched().filter((n) => n === 80)).toHaveLength(2)
      expect(result.contracts.map((contract) => contract.address)).toEqual(
        createdAddresses(chain),
      )
      expect(result.cursor).toEqual(cursorAt(chain, 200))
    })

    test('rescans everything when the range starts somewhere else', async () => {
      const chain = buildChain(150)
      const node = createFakeNode(chain)
      // Scanned from block 100 so far, but the range now starts at block 1
      // (what happens when the network's fork block is reset).
      const cursor = cursorAt(chain, 120, 100n)

      const result = await getContracts(node.client, { fromBlock: 1n, cursor })

      expect(result.mode).toBe('full')
      expect(node.blocksFetched()).toHaveLength(150)
      expect(result.cursor).toEqual(cursorAt(chain, 150))
    })
  })
})

describe('runCoalesced', () => {
  const deferred = () => {
    let resolve!: () => void
    const promise = new Promise<void>((r) => {
      resolve = r
    })
    return { promise, resolve }
  }

  test('runs one task at a time and shares the one that is waiting', async () => {
    const events: string[] = []
    const gate = deferred()

    const first = runCoalesced('coalesce-a', async () => {
      events.push('first:start')
      await gate.promise
      events.push('first:end')
      return 'first'
    })
    const second = runCoalesced('coalesce-a', async () => {
      events.push('second')
      return 'second'
    })
    const third = runCoalesced('coalesce-a', async () => {
      events.push('third')
      return 'third'
    })
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(events).toEqual(['first:start'])

    gate.resolve()
    expect(await Promise.all([first, second, third])).toEqual([
      'first',
      'second',
      'second',
    ])
    expect(events).toEqual(['first:start', 'first:end', 'second'])

    // Idle again: the next call starts right away.
    expect(await runCoalesced('coalesce-a', async () => 'again')).toBe('again')
  })

  test('keeps going after a task failed', async () => {
    const gate = deferred()
    const first = runCoalesced('coalesce-b', async () => {
      await gate.promise
      throw new Error('boom')
    })
    const second = runCoalesced('coalesce-b', async () => 'second')
    gate.resolve()

    await expect(first).rejects.toThrow('boom')
    expect(await second).toBe('second')
  })

  test('does not hold back other keys', async () => {
    const gate = deferred()
    const slow = runCoalesced('coalesce-c', () => gate.promise)
    expect(await runCoalesced('coalesce-d', async () => 'fast')).toBe('fast')
    gate.resolve()
    await slow
  })
})
