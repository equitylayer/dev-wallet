import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  type Address,
  type Hex,
  type RpcTransactionReceipt,
  encodeDeployData,
  encodeEventTopics,
  encodeFunctionData,
  getAddress,
  numberToHex,
  parseEther,
} from 'viem'
import { entryPoint07Abi } from 'viem/account-abstraction'

import { MockERC20 } from '../../test/contracts/generated'
import type { BatchRecord } from './batch-records'
import { type CallsStatus, getCallsStatus } from './calls-status'
import { DEVWALLET_SPONSOR, KERNEL_V3_3 } from './constants'
import { getCapabilities, parseSendCalls } from './eip5792'
import { WalletRpcError } from './errors'
import { type ExecutionResult, executeCalls } from './execute'
import { setDelegation } from './kernel'
import { type Node, connectNode } from './node'
import { ensureAaContracts } from './setup'
import { prepareSponsor } from './sponsor'
import { DEV_ACCOUNTS, startAnvil, waitForReceipt } from './testing/anvil'
import { memoryRecords } from './testing/wallet'
import { type Call, type SponsorSetting, toRpcCall } from './types'
import { buildUserOp, signUserOp, submitUserOp } from './userop'
import { type WalletCoreDeps, handleWalletRequest } from './wallet-core'

const account = DEV_ACCOUNTS[1]
const plain = DEV_ACCOUNTS[2]
const X = getAddress('0x00000000000000000000000000000000000a0a0a')
const Y = getAddress('0x00000000000000000000000000000000000b0b0b')
const REVERTER = getAddress('0x00000000000000000000000000000000000dead0')
// Runtime code that reverts with the 4 bytes `0xdeadbeef`.
const REVERTER_CODE = '0x63deadbeef5f526004601cfd'
const DEVWALLET: SponsorSetting = { kind: 'devwallet' }

let anvil: { rpcUrl: string; stop(): Promise<void> }
let node: Node
let chainId: number

function useAnvil() {
  beforeEach(async () => {
    anvil = await startAnvil()
    node = await connectNode({ rpcUrl: anvil.rpcUrl })
    chainId = await node.chainId()
    await ensureAaContracts(node)
    await setDelegation(node, account, KERNEL_V3_3)
    await node.setCode(REVERTER, REVERTER_CODE)
  })
  afterEach(() => anvil.stop())
}

async function rejection(promise: Promise<unknown>): Promise<WalletRpcError> {
  try {
    await promise
  } catch (e) {
    if (e instanceof WalletRpcError) return e
    throw e
  }
  throw new Error('expected a WalletRpcError, but it resolved')
}

async function codeOf(run: () => unknown): Promise<number> {
  return (await rejection(Promise.resolve().then(run))).code
}

describe('getCapabilities', () => {
  test('answers for the chain with its atomic status', () => {
    expect(getCapabilities({ chainId: 31337, status: 'supported' })).toEqual({
      '0x7a69': { atomic: { status: 'supported' } },
    })
    expect(getCapabilities({ chainId: 31337, status: 'ready' })).toEqual({
      '0x7a69': { atomic: { status: 'ready' } },
    })
    expect(getCapabilities({ chainId: 31337, status: 'unsupported' })).toEqual({
      '0x7a69': { atomic: { status: 'unsupported' } },
    })
  })

  test('answers only for the requested chains', () => {
    expect(
      getCapabilities({
        chainId: 31337,
        status: 'supported',
        requestedChainIds: ['0x1'],
      }),
    ).toEqual({})
    expect(
      getCapabilities({
        chainId: 31337,
        status: 'supported',
        requestedChainIds: ['0x1', '0x7A69'],
      }),
    ).toEqual({ '0x7a69': { atomic: { status: 'supported' } } })
  })
})

describe('parseSendCalls', () => {
  const ctx = (
    overrides: Partial<Parameters<typeof parseSendCalls>[1]> = {},
  ) => ({
    chainId: 31337,
    activeAccount: DEV_ACCOUNTS[0] as Address,
    knownAccounts: [DEV_ACCOUNTS[0], DEV_ACCOUNTS[1]] as Address[],
    records: memoryRecords(),
    ...overrides,
  })
  const params = (overrides: Record<string, unknown> = {}) => [
    {
      version: '2.0.0',
      chainId: '0x7a69',
      atomicRequired: false,
      calls: [{ to: X }],
      ...overrides,
    },
  ]
  const parse = (
    overrides: Record<string, unknown> = {},
    context = ctx(),
  ) => parseSendCalls(params(overrides), context)

  test('a valid request parses, with calls in wallet form', () => {
    const parsed = parse({
      id: '0x1234',
      from: DEV_ACCOUNTS[1],
      atomicRequired: true,
      calls: [{ to: X, value: '0x10', data: '0xabcd' }, { to: Y }],
    })
    expect(parsed).toEqual({
      id: '0x1234',
      from: DEV_ACCOUNTS[1],
      atomicRequired: true,
      calls: [{ to: X, value: 16n, data: '0xabcd' }, { to: Y }],
    })
  })

  // Spec §4 (R55): deployments go out with eth_sendTransaction.
  test('a call without `to` is -32602, even alone: wallet_sendCalls cannot deploy', async () => {
    for (const calls of [
      [{ data: '0x6000' }],
      [{ to: null, data: '0x6000' }],
      [{ to: X }, { data: '0x6000' }],
    ]) {
      const error = await rejection(
        Promise.resolve().then(() => parse({ calls })),
      )
      expect(error.code).toBe(-32602)
      expect(error.message).toBe(
        "wallet_sendCalls can't deploy a contract; send it with eth_sendTransaction",
      )
    }
  })

  test('a missing or other version is -32602', async () => {
    for (const version of [undefined, '1.0.0', '2.0', 2]) {
      expect(await codeOf(() => parse({ version }))).toBe(-32602)
    }
  })

  test('a chain other than the active one is 5710', async () => {
    expect(await codeOf(() => parse({ chainId: '0x1' }))).toBe(5710)
    expect(parse({ chainId: '0x7A69' }).id).toBeString()
  })

  test('a missing or malformed chainId is -32602', async () => {
    expect(await codeOf(() => parse({ chainId: undefined }))).toBe(-32602)
    expect(await codeOf(() => parse({ chainId: 31337 }))).toBe(-32602)
    expect(await codeOf(() => parse({ chainId: 'mainnet' }))).toBe(-32602)
  })

  test('a duplicate id is 5720', async () => {
    const records = memoryRecords()
    records.put({ id: '0xabc' } as BatchRecord)
    expect(await codeOf(() => parse({ id: '0xabc' }, ctx({ records })))).toBe(
      5720,
    )
    expect(parse({ id: '0xabd' }, ctx({ records })).id).toBe('0xabd')
  })

  test('capabilities nobody supports are 5700 unless optional', async () => {
    expect(await codeOf(() => parse({ capabilities: { foo: {} } }))).toBe(5700)
    expect(
      await codeOf(() =>
        parse({ capabilities: { foo: { optional: false } } }),
      ),
    ).toBe(5700)
    expect(parse({ capabilities: { foo: { optional: true } } }).calls).toEqual([
      { to: X },
    ])
    expect(parse({ capabilities: undefined }).calls).toEqual([{ to: X }])
    expect(parse({ capabilities: {} }).calls).toEqual([{ to: X }])
  })

  test('call-level capabilities follow the same rule', async () => {
    expect(
      await codeOf(() =>
        parse({ calls: [{ to: X, capabilities: { bar: {} } }] }),
      ),
    ).toBe(5700)
    expect(
      parse({
        calls: [{ to: X, capabilities: { bar: { optional: true } } }],
      }).calls,
    ).toEqual([{ to: X }])
  })

  test('a from that is not a known account is 4100', async () => {
    expect(await codeOf(() => parse({ from: DEV_ACCOUNTS[5] }))).toBe(4100)
  })

  test('from matches case-insensitively and comes back as the known address', () => {
    expect(parse({ from: DEV_ACCOUNTS[1].toLowerCase() }).from).toBe(
      DEV_ACCOUNTS[1],
    )
  })

  test('a missing from is the active account', () => {
    expect(parse().from).toBe(DEV_ACCOUNTS[0])
    expect(parse({ from: undefined }).from).toBe(DEV_ACCOUNTS[0])
  })

  test('a missing id is generated as 32 random bytes', () => {
    const a = parse().id
    const b = parse().id
    expect(a).toMatch(/^0x[0-9a-f]{64}$/)
    expect(b).toMatch(/^0x[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
  })

  test('atomicRequired is passed through, and defaults to false', async () => {
    expect(parse({ atomicRequired: true }).atomicRequired).toBe(true)
    expect(parse({ atomicRequired: false }).atomicRequired).toBe(false)
    expect(parse({ atomicRequired: undefined }).atomicRequired).toBe(false)
    expect(await codeOf(() => parse({ atomicRequired: 'yes' }))).toBe(-32602)
  })

  test('empty, missing or malformed calls are -32602', async () => {
    for (const calls of [[], undefined, 'nope', [null], [{ to: 'x' }]]) {
      expect(await codeOf(() => parse({ calls }))).toBe(-32602)
    }
    expect(
      await codeOf(() => parse({ calls: [{ to: X, value: '10' }] })),
    ).toBe(-32602)
    expect(
      await codeOf(() => parse({ calls: [{ to: X, data: 'abcd' }] })),
    ).toBe(-32602)
  })

  test('params that are not a single object are -32602', async () => {
    for (const bad of [undefined, [], ['x'], [null]]) {
      expect(await codeOf(() => parseSendCalls(bad, ctx()))).toBe(-32602)
    }
  })
})

let nextId = 0

function baseRecord(overrides: Partial<BatchRecord>): BatchRecord {
  return {
    id: `0x${(++nextId).toString(16)}`,
    rpcUrl: anvil.rpcUrl,
    chainId,
    from: account,
    calls: [],
    path: 'self-call',
    transactionHashes: [],
    createdAt: Date.now(),
    ...overrides,
  }
}

/** The batch record `wallet_sendCalls` would store for `result`. */
function recordFrom(
  result: ExecutionResult,
  calls: Call[],
  from: Address,
): BatchRecord {
  return baseRecord({
    from,
    calls: calls.map(toRpcCall),
    path: result.path,
    transactionHashes: result.transactionHashes,
    ...(result.userOpHash && { userOpHash: result.userOpHash }),
  })
}

const kernelAccount = {
  address: account,
  mode: 'smart',
  onchain: { kind: 'kernel' },
  canSign: true,
} as const

const plainAccount = {
  address: plain,
  mode: 'plain-never',
  onchain: { kind: 'eoa' },
  canSign: true,
} as const

/** Sends `calls` from the kernel account and records the result. */
async function sendFromKernel(
  calls: Call[],
  overrides: { force?: boolean } = {},
): Promise<BatchRecord> {
  const result = await executeCalls({
    node,
    chainId,
    account: kernelAccount,
    calls,
    atomicRequired: false,
    sponsor: DEVWALLET,
    ...overrides,
  })
  await Promise.all(
    result.transactionHashes.map((h) => waitForReceipt(node, h)),
  )
  return recordFrom(result, calls, account)
}

/** Sends `calls` one by one from the plain account and records the result. */
async function sendFromPlain(
  calls: Call[],
  overrides: { force?: boolean } = {},
): Promise<BatchRecord> {
  const result = await executeCalls({
    node,
    chainId,
    account: plainAccount,
    calls,
    atomicRequired: false,
    sponsor: DEVWALLET,
    ...overrides,
  })
  await Promise.all(
    result.transactionHashes.map((h) => waitForReceipt(node, h)),
  )
  return recordFrom(result, calls, plain)
}

/** A plain-account record, as if it had been built from other records. */
function sequentialOf(...records: BatchRecord[]): BatchRecord {
  return {
    ...(records[0] as BatchRecord),
    path: 'sequential',
    transactionHashes: records.flatMap((r) => r.transactionHashes),
  }
}

function expectHexReceipt(
  receipt: NonNullable<CallsStatus['receipts']>[number],
  raw: RpcTransactionReceipt,
) {
  expect(receipt.transactionHash).toBe(raw.transactionHash)
  expect(receipt.blockHash).toBe(raw.blockHash)
  expect(receipt.blockNumber).toBe(raw.blockNumber)
  expect(receipt.gasUsed).toBe(raw.gasUsed)
  for (const field of [receipt.blockNumber, receipt.gasUsed, receipt.status]) {
    expect(field).toMatch(/^0x[0-9a-f]+$/)
  }
  for (const log of receipt.logs) {
    expect(Object.keys(log).sort()).toEqual(['address', 'data', 'topics'])
  }
}

function entryPointTopic(
  name: 'BeforeExecution' | 'UserOperationEvent' | 'UserOperationRevertReason',
): Hex {
  return encodeEventTopics({ abi: entryPoint07Abi, eventName: name })[0] as Hex
}

/** Deploys a MockERC20 from a dev account and returns its address. */
async function deployToken(): Promise<Address> {
  const hash = await node.request<Hex>('eth_sendTransaction', [
    {
      from: DEV_ACCOUNTS[0],
      data: encodeDeployData({
        abi: MockERC20.abi,
        bytecode: MockERC20.bytecode.object as Hex,
        args: ['Mock', 'MCK', 18],
      }),
    },
  ])
  return (await waitForReceipt(node, hash)).contractAddress as Address
}

describe('getCallsStatus', () => {
  useAnvil()

  test('a user op that ran is 200, atomic, with one receipt', async () => {
    const record = await sendFromKernel([
      { to: X, value: parseEther('1') },
      { to: Y, value: parseEther('2') },
    ])
    expect(record.path).toBe('userop')

    const status = await getCallsStatus(node, record)

    expect(status).toMatchObject({
      version: '2.0.0',
      id: record.id,
      chainId: numberToHex(chainId),
      status: 200,
      atomic: true,
    })
    expect(status.receipts).toHaveLength(1)
    const [receipt] = status.receipts ?? []
    expect(receipt?.status).toBe('0x1')
    expectHexReceipt(
      receipt as NonNullable<typeof receipt>,
      await waitForReceipt(node, record.transactionHashes[0] as Hex),
    )
  })

  test('a user op that failed inside a successful handleOps is 500, receipt 0x0', async () => {
    await prepareSponsor(node, DEVWALLET)
    // `handleOps` itself succeeds: the op's own call reverts.
    const op = await buildUserOp(node, {
      sender: account,
      calls: [{ to: REVERTER }],
    })
    const { signature, userOpHash } = await signUserOp(node, op, chainId)
    const hash = await submitUserOp(node, {
      op: { ...op, signature },
      bundler: DEVWALLET_SPONSOR,
    })
    const outer = await waitForReceipt(node, hash)
    expect(outer.status).toBe('0x1')

    const status = await getCallsStatus(
      node,
      baseRecord({
        calls: [{ to: REVERTER }],
        path: 'userop',
        transactionHashes: [hash],
        userOpHash,
      }),
    )

    expect(status.status).toBe(500)
    expect(status.atomic).toBe(true)
    expect(status.receipts?.map((r) => r.status)).toEqual(['0x0'])
    // The op's own logs include why it failed, but not the event that closes it.
    const topics = status.receipts?.[0]?.logs.map((l) => l.topics[0])
    expect(topics).toContain(entryPointTopic('UserOperationRevertReason'))
    expect(topics).not.toContain(entryPointTopic('UserOperationEvent'))
    expect(topics).not.toContain(entryPointTopic('BeforeExecution'))
  })

  test('a user op receipt has only the logs of that op', async () => {
    const token = await deployToken()
    const call = (functionName: 'mint' | 'transfer', to: Address): Call => ({
      to: token,
      data: encodeFunctionData({
        abi: MockERC20.abi,
        functionName,
        args: [to, 10n],
      }),
    })
    const record = await sendFromKernel([
      call('mint', account),
      call('transfer', Y),
    ])
    expect(record.path).toBe('userop')

    const status = await getCallsStatus(node, record)

    expect(status.status).toBe(200)
    const logs = status.receipts?.[0]?.logs ?? []
    const transfer = encodeEventTopics({
      abi: MockERC20.abi,
      eventName: 'Transfer',
    })[0]
    // The mint and the transfer, nothing from the EntryPoint around them.
    const lowercased = token.toLowerCase() as Address
    expect(logs.map((l) => [l.address, l.topics[0]])).toEqual([
      [lowercased, transfer],
      [lowercased, transfer],
    ])
    const topics = logs.map((l) => l.topics[0])
    expect(topics).not.toContain(entryPointTopic('BeforeExecution'))
    expect(topics).not.toContain(entryPointTopic('UserOperationEvent'))
    // The transaction itself does carry them.
    const outer = await waitForReceipt(
      node,
      record.transactionHashes[0] as Hex,
    )
    const outerTopics = outer.logs.map((l) => l.topics[0])
    expect(outerTopics).toContain(entryPointTopic('BeforeExecution'))
    expect(outerTopics).toContain(entryPointTopic('UserOperationEvent'))
  })

  test('a user op with no event in its transaction keeps all of its logs', async () => {
    const token = await deployToken()
    const record = await sendFromPlain([
      {
        to: token,
        data: encodeFunctionData({
          abi: MockERC20.abi,
          functionName: 'mint',
          args: [plain, 10n],
        }),
      },
    ])

    const status = await getCallsStatus(node, {
      ...record,
      path: 'userop',
      userOpHash: `0x${'11'.repeat(32)}`,
    })

    expect(status.status).toBe(500)
    expect(status.receipts?.[0]?.status).toBe('0x1')
    expect(status.receipts?.[0]?.logs).toHaveLength(1)
  })

  test('a user op with no event in its transaction is 500, with the outer status', async () => {
    const ok = await sendFromPlain([{ to: X, value: 1n }])
    const reverted = await sendFromPlain([{ to: REVERTER }], { force: true })
    const userOpHash = `0x${'11'.repeat(32)}` as const

    for (const [source, expected] of [
      [ok, '0x1'],
      [reverted, '0x0'],
    ] as const) {
      const status = await getCallsStatus(node, {
        ...source,
        path: 'userop',
        userOpHash,
      })
      expect(status.status).toBe(500)
      expect(status.receipts?.map((r) => r.status)).toEqual([expected])
    }
  })

  test('a reverted self-call is 500, receipt 0x0', async () => {
    const record = await sendFromKernel([{ to: REVERTER }], { force: true })
    expect(record.path).toBe('self-call')

    const status = await getCallsStatus(node, record)

    expect(status.status).toBe(500)
    expect(status.atomic).toBe(true)
    expect(status.receipts).toHaveLength(1)
    expect(status.receipts?.[0]?.status).toBe('0x0')
  })

  test('a self-call that ran is 200', async () => {
    const result = await executeCalls({
      node,
      chainId,
      account: kernelAccount,
      calls: [{ to: X, value: 1n }],
      atomicRequired: false,
      sponsor: { kind: 'off' },
    })
    expect(result.path).toBe('self-call')
    await waitForReceipt(node, result.transactionHashes[0] as Hex)

    const status = await getCallsStatus(
      node,
      recordFrom(result, [{ to: X, value: 1n }], account),
    )
    expect(status).toMatchObject({ status: 200, atomic: true })
    expect(status.receipts?.[0]?.status).toBe('0x1')
  })

  test('a deployment follows its receipt', async () => {
    // Init code that deploys a one-byte contract.
    const ok = await sendFromPlain([{ data: '0x600060005360016000f3' }])
    const failed = await sendFromPlain([{ data: REVERTER_CODE }], {
      force: true,
    })
    expect(ok.path).toBe('deploy')
    expect(failed.path).toBe('deploy')

    const deployed = await getCallsStatus(node, ok)
    const reverted = await getCallsStatus(node, failed)

    expect(deployed).toMatchObject({ status: 200, atomic: true })
    expect(reverted).toMatchObject({ status: 500, atomic: true })
    expect(reverted.receipts?.[0]?.status).toBe('0x0')
  })

  test('a sequential batch is 200 when all ran, not atomic', async () => {
    const record = await sendFromPlain([
      { to: X, value: 1n },
      { to: Y, value: 2n },
    ])
    expect(record.path).toBe('sequential')

    const status = await getCallsStatus(node, record)

    expect(status).toMatchObject({ status: 200, atomic: false })
    expect(status.receipts?.map((r) => r.status)).toEqual(['0x1', '0x1'])
  })

  test('a sequential batch with one ok and one reverted call is 600', async () => {
    const record = await sendFromPlain(
      [{ to: X, value: 1n }, { to: REVERTER }],
      { force: true },
    )
    expect(record.transactionHashes).toHaveLength(2)

    const status = await getCallsStatus(node, record)

    expect(status).toMatchObject({ status: 600, atomic: false })
    expect(status.receipts?.map((r) => r.status)).toEqual(['0x1', '0x0'])
  })

  test('a sequential batch where every call reverted is 500', async () => {
    const a = await sendFromPlain([{ to: REVERTER }], { force: true })
    const b = await sendFromPlain([{ to: REVERTER }], { force: true })

    const status = await getCallsStatus(node, sequentialOf(a, b))

    expect(status).toMatchObject({ status: 500, atomic: false })
    expect(status.receipts?.map((r) => r.status)).toEqual(['0x0', '0x0'])
  })
})

describe('getCallsStatus while nothing is mined (automine off)', () => {
  useAnvil()

  test('a user op is 100 with no receipts, then 200 once mined', async () => {
    // Fund the sponsor while blocks still mine: with automine off, the
    // paymaster deposit would never confirm and the op would fall back to a
    // self-call.
    await prepareSponsor(node, DEVWALLET)
    await node.request('evm_setAutomine', [false])
    const calls: Call[] = [{ to: X, value: 1n }]

    const result = await executeCalls({
      node,
      chainId,
      account: kernelAccount,
      calls,
      atomicRequired: false,
      sponsor: DEVWALLET,
    })
    expect(result.path).toBe('userop')
    const record = recordFrom(result, calls, account)

    const pending = await getCallsStatus(node, record)
    expect(pending).toMatchObject({ status: 100, atomic: true })
    expect(pending.receipts ?? []).toEqual([])

    await node.request('evm_mine')
    const mined = await getCallsStatus(node, record)
    expect(mined.status).toBe(200)
    expect(mined.receipts).toHaveLength(1)
  })

  test('two user ops from one account before a block are both 200 once mined', async () => {
    await prepareSponsor(node, DEVWALLET)
    await node.request('evm_setAutomine', [false])
    const calls: Call[] = [{ to: X, value: 1n }]
    const send = () =>
      executeCalls({
        node,
        chainId,
        account: kernelAccount,
        calls,
        atomicRequired: false,
        sponsor: DEVWALLET,
      })

    // The second must take the account's next nonce, from the pending block.
    const first = await send()
    const second = await send()
    expect([first.path, second.path]).toEqual(['userop', 'userop'])
    expect(second.userOpHash).not.toBe(first.userOpHash)
    const records = [first, second].map((r) => recordFrom(r, calls, account))
    for (const record of records)
      expect((await getCallsStatus(node, record)).status).toBe(100)

    await node.request('evm_mine')
    for (const record of records)
      expect((await getCallsStatus(node, record)).status).toBe(200)
    expect(await node.getBalance(X)).toBe(2n)
  })

  test('a self-call is 100, then 200', async () => {
    await node.request('evm_setAutomine', [false])
    const calls: Call[] = [{ to: X, value: 1n }]
    const result = await executeCalls({
      node,
      chainId,
      account: kernelAccount,
      calls,
      atomicRequired: false,
      sponsor: { kind: 'off' },
    })
    const record = recordFrom(result, calls, account)

    expect((await getCallsStatus(node, record)).status).toBe(100)
    await node.request('evm_mine')
    expect((await getCallsStatus(node, record)).status).toBe(200)
  })

  test('a sequential batch is 100 until every call is mined', async () => {
    await node.request('evm_setAutomine', [false])
    const calls: Call[] = [
      { to: X, value: 1n },
      { to: Y, value: 2n },
    ]
    const result = await executeCalls({
      node,
      chainId,
      account: plainAccount,
      calls,
      atomicRequired: false,
      sponsor: DEVWALLET,
    })
    const record = recordFrom(result, calls, plain)

    const pending = await getCallsStatus(node, record)
    expect(pending.status).toBe(100)
    expect(pending.receipts ?? []).toEqual([])

    await node.request('evm_mine')
    const mined = await getCallsStatus(node, record)
    expect(mined.status).toBe(200)
    expect(mined.receipts).toHaveLength(2)
  })
})

describe('handleWalletRequest', () => {
  useAnvil()

  function deps(overrides: Partial<WalletCoreDeps> = {}): WalletCoreDeps {
    return {
      node,
      rpcUrl: anvil.rpcUrl,
      chainId,
      activeAccount: account,
      accounts: [
        kernelAccount,
        plainAccount,
        {
          address: DEV_ACCOUNTS[3],
          mode: 'plain-upgradable',
          onchain: { kind: 'eoa' },
          canSign: true,
        },
      ],
      sponsor: DEVWALLET,
      records: memoryRecords(),
      ...overrides,
    }
  }

  const sendCalls = (
    overrides: Record<string, unknown> = {},
    parameters: Partial<WalletCoreDeps> = {},
  ) =>
    handleWalletRequest(deps(parameters), {
      method: 'wallet_sendCalls',
      params: [
        {
          version: '2.0.0',
          chainId: numberToHex(chainId),
          atomicRequired: false,
          calls: [{ to: X, value: '0x1' }],
          ...overrides,
        },
      ],
    })

  test('wallet_getCallsStatus with an unknown id is 5730', async () => {
    const code = await codeOf(() =>
      handleWalletRequest(deps(), {
        method: 'wallet_getCallsStatus',
        params: ['0xunknown'],
      }),
    )
    expect(code).toBe(5730)
  })

  test('wallet_getCallsStatus without an id is -32602', async () => {
    const code = await codeOf(() =>
      handleWalletRequest(deps(), { method: 'wallet_getCallsStatus' }),
    )
    expect(code).toBe(-32602)
  })

  test('any other method is 4200', async () => {
    for (const method of ['eth_blockNumber', 'wallet_foo']) {
      expect(await codeOf(() => handleWalletRequest(deps(), { method }))).toBe(
        4200,
      )
    }
  })

  test('wallet_getCapabilities answers per account, from its mode', async () => {
    const ask = (address: Address, chainIds?: Hex[]) =>
      handleWalletRequest(deps(), {
        method: 'wallet_getCapabilities',
        params: chainIds ? [address, chainIds] : [address],
      })

    expect(await ask(account)).toEqual({
      '0x7a69': { atomic: { status: 'supported' } },
    })
    expect(await ask(plain)).toEqual({
      '0x7a69': { atomic: { status: 'unsupported' } },
    })
    expect(await ask(DEV_ACCOUNTS[3].toLowerCase() as Address)).toEqual({
      '0x7a69': { atomic: { status: 'ready' } },
    })
    expect(await ask(account, ['0x1'])).toEqual({})
  })

  test('wallet_getCapabilities for an unknown address is 4100', async () => {
    const code = await codeOf(() =>
      handleWalletRequest(deps(), {
        method: 'wallet_getCapabilities',
        params: [DEV_ACCOUNTS[8]],
      }),
    )
    expect(code).toBe(4100)
  })

  test('wallet_getCapabilities without a valid address is -32602', async () => {
    for (const params of [undefined, [], ['nope']]) {
      const code = await codeOf(() =>
        handleWalletRequest(deps(), {
          method: 'wallet_getCapabilities',
          params,
        }),
      )
      expect(code).toBe(-32602)
    }
  })

  test('wallet_sendCalls executes, stores the record and returns the id', async () => {
    const records = memoryRecords()
    const before = Date.now()

    const result = await sendCalls(
      {
        id: '0xfeed',
        from: account,
        atomicRequired: true,
        calls: [
          { to: X, value: '0x1' },
          { to: Y, value: '0x2', data: '0x' },
        ],
      },
      { records },
    )

    expect(result).toEqual({ id: '0xfeed' })
    const record = records.get('0xfeed')
    expect(record).toMatchObject({
      id: '0xfeed',
      rpcUrl: anvil.rpcUrl,
      chainId,
      from: account,
      calls: [
        { to: X, value: '0x1' },
        { to: Y, value: '0x2', data: '0x' },
      ],
      path: 'userop',
    })
    expect(record?.transactionHashes).toHaveLength(1)
    expect(record?.userOpHash).toMatch(/^0x[0-9a-f]{64}$/)
    expect(record?.createdAt).toBeGreaterThanOrEqual(before)

    await waitForReceipt(node, record?.transactionHashes[0] as Hex)
    const status = await handleWalletRequest(deps({ records }), {
      method: 'wallet_getCallsStatus',
      params: ['0xfeed'],
    })
    expect(status).toMatchObject({ id: '0xfeed', status: 200, atomic: true })
  })

  test('wallet_sendCalls generates an id, and uses the active account by default', async () => {
    const records = memoryRecords()
    const { id } = (await sendCalls({}, { records })) as { id: string }
    expect(id).toMatch(/^0x[0-9a-f]{64}$/)
    expect(records.get(id)?.from).toBe(account)
  })

  test('wallet_sendCalls sends from the account named by `from`', async () => {
    const records = memoryRecords()
    const { id } = (await sendCalls(
      { from: plain.toLowerCase(), calls: [{ to: X, value: '0x1' }] },
      { records },
    )) as { id: string }
    expect(records.get(id)).toMatchObject({ from: plain, path: 'sequential' })
  })

  test('a send that is refused issues no id and stores nothing', async () => {
    const stored: BatchRecord[] = []
    const records = {
      get: () => undefined,
      put: (r: BatchRecord) => void stored.push(r),
    }
    const before = await node.blockNumber()

    // The call is expected to revert: code 3, with the revert data.
    const reverted = await rejection(
      sendCalls({ calls: [{ to: REVERTER }] }, { records }),
    )
    expect(reverted.code).toBe(3)
    expect(reverted.data).toBe('0xdeadbeef')

    // Atomicity can't be had from a plain account.
    expect(
      await codeOf(() =>
        sendCalls({ from: plain, atomicRequired: true }, { records }),
      ),
    ).toBe(5760)

    // Nothing to send.
    expect(await codeOf(() => sendCalls({ calls: [] }, { records }))).toBe(
      -32602,
    )

    expect(await node.blockNumber()).toBe(before)
    expect(stored).toEqual([])
  })

  test('a duplicate id is 5720 and sends nothing', async () => {
    const records = memoryRecords()
    await sendCalls({ id: '0xdup' }, { records })
    await waitForReceipt(
      node,
      records.get('0xdup')?.transactionHashes[0] as Hex,
    )
    const before = await node.blockNumber()

    expect(await codeOf(() => sendCalls({ id: '0xdup' }, { records }))).toBe(
      5720,
    )
    expect(await node.blockNumber()).toBe(before)
  })
})
