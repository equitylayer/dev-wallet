import {
  type Address,
  type Chain,
  type Client,
  type Hash,
  type Hex,
  type RpcTransactionReceipt,
  type TransactionReceipt,
  type Transport,
  formatTransactionReceipt,
  hexToBigInt,
  numberToHex,
} from 'viem'

// This module must stay free of anything that touches `chrome.*` (stores,
// messengers, the app query client) so it can be unit tested with a fake
// JSON-RPC transport.

/** Maximum number of RPC requests a scan keeps in flight at any time. */
export const CONTRACTS_SCAN_CONCURRENCY = 8

/**
 * Number of blocks scanned between two checkpoints. Every checkpoint reports
 * what was found so far (and where the scan got to) through `onProgress`, so a
 * long scan that is interrupted does not start over.
 */
export const CONTRACTS_SCAN_CHECKPOINT_BLOCKS = 500

/** Where a scan got to: every block in `fromBlock…blockNumber` was scanned. */
export type ContractsScanCursor = {
  /** First block of the range the cursor was scanned from. */
  fromBlock: bigint
  /** Last block that was fully scanned. */
  blockNumber: bigint
  /** Hash of `blockNumber` when it was scanned, to detect chain resets. */
  blockHash: Hash
}

export type ScannedContract = {
  address: Address
  bytecode: Hex | null
  receipt: TransactionReceipt
}

type ScanClient = Client<Transport, Chain | undefined>

export type GetContractsParameters = {
  /** First block of the range (inclusive). */
  fromBlock: bigint
  /** Last block of the range (inclusive). */
  toBlock?: bigint | 'latest'
  /**
   * Cursor of a previous scan of the same range. When it is still valid (same
   * `fromBlock`, and the block it points to still has the same hash) only the
   * blocks after it are scanned. Otherwise the whole range is scanned.
   */
  cursor?: ContractsScanCursor | null
  /** Maximum requests in flight. */
  concurrency?: number
  /** Blocks per checkpoint. */
  checkpointBlocks?: number
  /** Called after every checkpoint with the contracts found since the last one. */
  onProgress?: (progress: {
    contracts: ScannedContract[]
    cursor: ContractsScanCursor
  }) => void | Promise<void>
}

export type GetContractsReturnType = {
  /** Contracts found by this run (not the ones a `cursor` already covered). */
  contracts: ScannedContract[]
  /** Where the scan got to, `null` if the range was empty. */
  cursor: ContractsScanCursor | null
  mode: 'full' | 'incremental'
}

export async function getContracts(
  client: ScanClient,
  {
    fromBlock,
    toBlock = 'latest',
    cursor,
    concurrency = CONTRACTS_SCAN_CONCURRENCY,
    checkpointBlocks = CONTRACTS_SCAN_CHECKPOINT_BLOCKS,
    onProgress,
  }: GetContractsParameters,
): Promise<GetContractsReturnType> {
  const limiter = createLimiter(Math.max(1, Math.floor(concurrency)))
  const rawRequest = client.request as unknown as RawRequest
  const request = <T>(method: string, params: unknown[]) =>
    limiter.run(() => rawRequest({ method, params }) as Promise<T>)

  const getBlock = (blockNumber: bigint) =>
    request<RpcBlock | null>('eth_getBlockByNumber', [
      numberToHex(blockNumber),
      false,
    ])

  const formatReceipt: (receipt: RpcTransactionReceipt) => TransactionReceipt =
    client.chain?.formatters?.transactionReceipt?.format ??
    formatTransactionReceipt

  async function scanBlock(blockNumber: bigint) {
    const block = await getBlock(blockNumber)
    if (!block) throw new Error(`Block ${blockNumber} not found.`)

    const hashes = block.transactions
    if (hashes.length === 0)
      return { hash: block.hash, contracts: [] as ScannedContract[] }

    const receipts =
      (await getBlockReceipts(client, blockNumber, hashes.length, request)) ??
      (await Promise.all(
        hashes.map(async (hash) => {
          const receipt = await request<RpcTransactionReceipt | null>(
            'eth_getTransactionReceipt',
            [hash],
          )
          if (!receipt) throw new Error(`Receipt of ${hash} not found.`)
          return receipt
        }),
      ))

    const contracts = await Promise.all(
      receipts.map(async (receipt) => {
        const address = receipt.contractAddress
        if (!address) return null

        const bytecode = await request<Hex>('eth_getCode', [address, 'latest'])
        return {
          address,
          bytecode: bytecode && bytecode !== '0x' ? bytecode : null,
          receipt: formatReceipt(receipt),
        } satisfies ScannedContract
      }),
    )
    return { hash: block.hash, contracts: contracts.filter(Boolean) }
  }

  try {
    const toBlockNumber =
      toBlock === 'latest'
        ? hexToBigInt(await request<Hex>('eth_blockNumber', []))
        : toBlock
    if (toBlockNumber < fromBlock)
      return { contracts: [], cursor: null, mode: 'full' }

    // Incremental only if the cursor is for this range and still on this chain.
    let start = fromBlock
    let mode: GetContractsReturnType['mode'] = 'full'
    if (
      cursor &&
      cursor.fromBlock === fromBlock &&
      cursor.blockNumber >= fromBlock &&
      cursor.blockNumber <= toBlockNumber
    ) {
      const block = await getBlock(cursor.blockNumber)
      if (block?.hash.toLowerCase() === cursor.blockHash.toLowerCase()) {
        if (cursor.blockNumber === toBlockNumber)
          return { contracts: [], cursor, mode: 'incremental' }
        start = cursor.blockNumber + 1n
        mode = 'incremental'
      }
    }

    const contracts: ScannedContract[] = []
    let lastCursor = mode === 'incremental' ? cursor! : null
    const size = BigInt(Math.max(1, Math.floor(checkpointBlocks)))
    for (let from = start; from <= toBlockNumber; from += size) {
      const last = from + size - 1n
      const to = last < toBlockNumber ? last : toBlockNumber

      const blockNumbers = Array.from(
        { length: Number(to - from) + 1 },
        (_, i) => from + BigInt(i),
      )
      const blocks = await Promise.all(blockNumbers.map(scanBlock))

      const found = blocks.flatMap((block) => block.contracts)
      contracts.push(...found)
      lastCursor = {
        fromBlock,
        blockNumber: to,
        blockHash: blocks[blocks.length - 1].hash,
      }
      await onProgress?.({ contracts: found, cursor: lastCursor })
    }

    return { contracts, cursor: lastCursor, mode }
  } catch (error) {
    // Don't leave the rest of a failed scan queued up.
    limiter.stop(error)
    throw error
  }
}

////////////////////////////////////////////////////////////////////////
// Receipts

const blockReceiptsSupport = new WeakMap<
  object,
  { supported?: boolean; probe?: Promise<unknown> }
>()

/**
 * Every receipt of a block in one request, or `null` if the node cannot
 * provide them (the caller then asks for receipts one by one).
 *
 * Whether the node supports `eth_getBlockReceipts` is learned from the first
 * request and remembered per client. Blocks that are scanned concurrently wait
 * for that first answer instead of all probing the node.
 */
async function getBlockReceipts(
  client: object,
  blockNumber: bigint,
  expectedCount: number,
  request: <T>(method: string, params: unknown[]) => Promise<T>,
): Promise<RpcTransactionReceipt[] | null> {
  let support = blockReceiptsSupport.get(client)
  if (!support) {
    support = {}
    blockReceiptsSupport.set(client, support)
  }

  if (support.supported === undefined && support.probe)
    await support.probe.catch(() => {})
  if (support.supported === false) return null

  const call = () =>
    request<RpcTransactionReceipt[] | null>('eth_getBlockReceipts', [
      numberToHex(blockNumber),
    ])
  let receipts: RpcTransactionReceipt[] | null
  if (support.supported === undefined) {
    const probe = call()
    support.probe = probe
    try {
      receipts = await probe
      support.supported = true
    } catch (error) {
      if (!isMethodUnsupported(error)) throw error
      support.supported = false
      return null
    } finally {
      support.probe = undefined
    }
  } else receipts = await call()

  // A node that answers with something unusable is asked again, one by one.
  if (!Array.isArray(receipts) || receipts.length !== expectedCount) return null
  return receipts
}

const unsupportedMethodCodes = new Set([
  -32601, // Method not found
  -32004, // Method not supported
  4200, // Unsupported provider method
])
const unsupportedMethodMessage =
  /method\b.{0,100}(not found|not supported|not available|does not exist|unsupported)|unsupported method|unknown method/i

function isMethodUnsupported(error: unknown) {
  let current = error as { code?: unknown; message?: unknown; cause?: unknown }
  for (let depth = 0; current && depth < 8; depth++) {
    if (
      typeof current.code === 'number' &&
      unsupportedMethodCodes.has(current.code)
    )
      return true
    if (
      typeof current.message === 'string' &&
      unsupportedMethodMessage.test(current.message)
    )
      return true
    current = current.cause as typeof current
  }
  return false
}

////////////////////////////////////////////////////////////////////////
// Concurrency

type RawRequest = (args: {
  method: string
  params?: unknown[]
}) => Promise<unknown>

type RpcBlock = { hash: Hash; number: Hex; transactions: Hash[] }

/** Runs at most `concurrency` tasks at a time, in the order they were queued. */
function createLimiter(concurrency: number) {
  let active = 0
  let stopped: { error: unknown } | undefined
  const queue: {
    run: () => Promise<void>
    reject: (error: unknown) => void
  }[] = []

  function next() {
    while (active < concurrency && queue.length > 0) {
      active++
      queue.shift()!.run()
    }
  }

  return {
    run<T>(task: () => Promise<T>) {
      if (stopped) return Promise.reject(stopped.error)
      return new Promise<T>((resolve, reject) => {
        queue.push({
          reject,
          async run() {
            try {
              resolve(await task())
            } catch (error) {
              reject(error)
            } finally {
              active--
              next()
            }
          },
        })
        next()
      })
    },
    /** Rejects everything that has not started yet and refuses new tasks. */
    stop(error: unknown) {
      stopped ??= { error }
      for (const entry of queue.splice(0)) entry.reject(error)
    },
  }
}

type Lane = { running?: Promise<unknown>; queued?: Promise<unknown> }
const lanes = new Map<string, Lane>()

/**
 * Runs `task` once everything else queued under `key` has finished.
 *
 * Callers that arrive while a task is running and another one is already
 * waiting share the waiting one. It has not started yet, so it will see
 * everything that happened up to its start: no need to run it once per caller.
 * Use it for tasks that read the state they work from when they start.
 */
export function runCoalesced<T>(
  key: string,
  task: () => Promise<T>,
): Promise<T> {
  let lane = lanes.get(key)
  if (!lane) {
    lane = {}
    lanes.set(key, lane)
  }
  const current = lane
  if (current.queued) return current.queued as Promise<T>

  const start = () => {
    const promise = Promise.resolve().then(task)
    current.running = promise
    const done = () => {
      if (current.running !== promise) return
      current.running = undefined
      if (!current.queued) lanes.delete(key)
    }
    promise.then(done, done)
    return promise
  }

  if (!current.running) return start()

  const queued = current.running
    .then(
      () => {},
      () => {},
    )
    .then(() => {
      current.queued = undefined
      return start()
    })
  current.queued = queued
  return queued
}
