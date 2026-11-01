import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  type Address,
  type Hex,
  type RpcTransactionReceipt,
  encodeDeployData,
  encodeFunctionData,
  getAddress,
  hexToBigInt,
  parseEther,
} from 'viem'

import { MockERC20 } from '../../test/contracts/generated'
import {
  DEVWALLET_PAYMASTER,
  DEVWALLET_SPONSOR,
  ENTRY_POINT_07,
  KERNEL_V3_3,
} from './constants'
import { WalletRpcError } from './errors'
import {
  type ExecuteInput,
  type ExecutionResult,
  executeCalls,
  planExecution,
} from './execute'
import { setDelegation } from './kernel'
import { type Node, connectNode } from './node'
import { simulateCalls } from './simulate'
import { ensureAaContracts } from './setup'
import { assessSponsor } from './sponsor'
import { DEV_ACCOUNTS, startAnvil, waitForReceipt } from './testing/anvil'
import type { Call, SponsorSetting } from './types'
import { getUserOpOutcome } from './userop'

const account = DEV_ACCOUNTS[1]
const X = getAddress('0x00000000000000000000000000000000000a0a0a')
const Y = getAddress('0x00000000000000000000000000000000000b0b0b')
// An address the node holds no key for.
const FRESH = getAddress('0x00000000000000000000000000000000000f0f0f')
const REVERTER = getAddress('0x00000000000000000000000000000000000dead0')
// Runtime code that reverts with the 4 bytes `0xdeadbeef`.
const REVERTER_CODE = '0x63deadbeef5f526004601cfd'
const REVERT_DATA = '0xdeadbeef'
// Init code that reverts with `0xdeadbeef`.
const REVERTING_INIT = REVERTER_CODE
// Init code that deploys a one-byte contract (`STOP`) and accepts value.
const PAYABLE_INIT = '0x600060005360016000f3'
const DEVWALLET: SponsorSetting = { kind: 'devwallet' }
const OFF: SponsorSetting = { kind: 'off' }
const IMPERSONATED_REASON =
  "Impersonated accounts can't sign, so they pay their own gas."

let anvil: { rpcUrl: string; stop(): Promise<void> }
let node: Node
let chainId: number

beforeEach(async () => {
  anvil = await startAnvil()
  node = await connectNode({ rpcUrl: anvil.rpcUrl })
  chainId = await node.chainId()
  await ensureAaContracts(node)
  await setDelegation(node, account, KERNEL_V3_3)
  await node.setCode(REVERTER, REVERTER_CODE)
})
afterEach(() => anvil.stop())

/** A Kernel-delegated dev account that can sign, with sponsorship on. */
function input(overrides: Partial<ExecuteInput> = {}): ExecuteInput {
  return {
    node,
    chainId,
    account: {
      address: account,
      mode: 'smart',
      onchain: { kind: 'kernel' },
      canSign: true,
    },
    calls: [{ to: X, value: parseEther('1') }],
    atomicRequired: false,
    sponsor: DEVWALLET,
    ...overrides,
  }
}

/** A plain account: no Kernel, so no atomic batches. */
function plainAccount(address: Address = account): ExecuteInput['account'] {
  return {
    address,
    mode: 'plain-never',
    onchain: { kind: 'eoa' },
    canSign: true,
  }
}

/** A Kernel-delegated account the node has no key for, so it can't sign. */
async function impersonatedKernel(): Promise<ExecuteInput['account']> {
  await setDelegation(node, FRESH, KERNEL_V3_3)
  await node.setBalance(FRESH, parseEther('10'))
  return {
    address: FRESH,
    mode: 'smart',
    onchain: { kind: 'kernel' },
    canSign: false,
  }
}

type Tx = { from: Address; to: Address | null; value: Hex; gas: Hex }

/** The transaction, with its addresses checksummed (the node lowercases). */
async function transactionOf(hash: Hex): Promise<Tx> {
  const tx = await node.request<Tx>('eth_getTransactionByHash', [hash])
  return {
    ...tx,
    from: getAddress(tx.from),
    to: tx.to && getAddress(tx.to),
  }
}

async function receiptsOf(
  result: ExecutionResult,
): Promise<RpcTransactionReceipt[]> {
  return Promise.all(
    result.transactionHashes.map((hash) => waitForReceipt(node, hash)),
  )
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

describe('rule 0: there must be something to execute', () => {
  test('an empty batch is rejected with -32602, nothing mined', async () => {
    const before = await node.blockNumber()

    for (const run of [planExecution, executeCalls]) {
      for (const overrides of [{}, { account: plainAccount() }, { sponsor: OFF }]) {
        const error = await rejection(run(input({ calls: [], ...overrides })))
        expect(error.code).toBe(-32602)
        expect(error.message).toMatch(/no calls/i)
      }
    }
    expect(await node.blockNumber()).toBe(before)
  })
})

describe('rule 1: a call without `to` is a deployment', () => {
  const deployMock: Call = {
    data: encodeDeployData({
      abi: MockERC20.abi,
      bytecode: MockERC20.bytecode.object as Hex,
      args: ['Mock', 'MCK', 18],
    }),
  }

  test('a single call is a plain deployment from the account', async () => {
    const result = await executeCalls(input({ calls: [deployMock] }))

    expect(result).toMatchObject({
      path: 'deploy',
      payer: account,
      sponsored: false,
      simulation: { ok: true, gasUsed: null, balanceChanges: null },
    })
    expect(result.fallbackReason).toBeUndefined()
    expect(result.userOpHash).toBeUndefined()
    expect(result.transactionHashes).toHaveLength(1)

    const [receipt] = await receiptsOf(result)
    expect(receipt?.status).toBe('0x1')
    expect(receipt?.contractAddress).toBeString()
    expect(
      await node.getCode(receipt?.contractAddress as Address),
    ).not.toBe('0x')
    const tx = await transactionOf(result.transactionHashes[0] as Hex)
    expect(tx).toMatchObject({ from: account, to: null })
  })

  test('a deployment is not sponsored in any mode', async () => {
    const plan = await planExecution(
      input({ calls: [deployMock], account: plainAccount() }),
    )
    expect(plan).toMatchObject({ path: 'deploy', payer: account })
  })

  test('the deployment carries its value', async () => {
    const result = await executeCalls(
      input({ calls: [{ data: PAYABLE_INIT, value: 1234n }] }),
    )
    const [receipt] = await receiptsOf(result)
    expect(receipt?.status).toBe('0x1')
    expect(await node.getBalance(receipt?.contractAddress as Address)).toBe(
      1234n,
    )
  })

  test('a deployment that would revert is refused with code 3, nothing mined', async () => {
    const calls = [{ data: REVERTING_INIT as Hex }]
    const before = await node.blockNumber()

    const planned = await rejection(planExecution(input({ calls })))
    const executed = await rejection(executeCalls(input({ calls })))

    for (const error of [planned, executed]) {
      expect(error.code).toBe(3)
      expect(error.data).toBe(REVERT_DATA)
      expect(error.message).toContain('Deployment reverted')
    }
    expect(await node.blockNumber()).toBe(before)
  })

  test('a deployment that would revert is sent with force, and reverts', async () => {
    const result = await executeCalls(
      input({ calls: [{ data: REVERTING_INIT as Hex }], force: true }),
    )
    expect(result).toMatchObject({
      path: 'deploy',
      payer: account,
      simulation: { ok: false, failedIndex: 0, revertData: REVERT_DATA },
    })
    const [receipt] = await receiptsOf(result)
    expect(receipt?.status).toBe('0x0')
    const tx = await transactionOf(result.transactionHashes[0] as Hex)
    expect(hexToBigInt(tx.gas)).toBe(1_000_000n)
  })

  test('a deployment in a batch of several calls is rejected with -32602', async () => {
    const before = await node.blockNumber()
    const calls: Call[] = [{ to: X }, deployMock, { to: Y }]

    for (const run of [planExecution, executeCalls]) {
      const error = await rejection(run(input({ calls })))
      expect(error.code).toBe(-32602)
      expect(error.message).toMatch(/deploy/i)
    }
    expect(await node.blockNumber()).toBe(before)
  })

  test('is checked before whether the account can batch', async () => {
    const error = await rejection(
      planExecution(
        input({
          calls: [{ to: X }, deployMock],
          account: plainAccount(),
          atomicRequired: true,
        }),
      ),
    )
    expect(error.code).toBe(-32602)
  })
})

describe('rule 2: accounts that cannot batch atomically', () => {
  test('atomicRequired is refused with 5760', async () => {
    const before = await node.blockNumber()
    for (const run of [planExecution, executeCalls]) {
      const error = await rejection(
        run(input({ account: plainAccount(), atomicRequired: true })),
      )
      expect(error.code).toBe(5760)
    }
    expect(await node.blockNumber()).toBe(before)
  })

  test('an account that is only ready to upgrade is not atomic yet', async () => {
    const error = await rejection(
      planExecution(
        input({
          account: {
            address: account,
            mode: 'plain-upgradable',
            onchain: { kind: 'eoa' },
            canSign: true,
          },
          atomicRequired: true,
        }),
      ),
    )
    expect(error.code).toBe(5760)
  })

  test('otherwise each call is its own transaction from the account', async () => {
    const xBefore = await node.getBalance(X)
    const yBefore = await node.getBalance(Y)
    const calls: Call[] = [
      { to: X, value: parseEther('1') },
      { to: Y, value: parseEther('2') },
    ]

    const result = await executeCalls(
      input({ account: plainAccount(), calls, sponsor: DEVWALLET }),
    )

    expect(result).toMatchObject({
      path: 'sequential',
      payer: account,
      sponsored: false,
      simulation: { ok: true },
    })
    expect(result.fallbackReason).toBeUndefined()
    expect(result.userOpHash).toBeUndefined()
    expect(result.transactionHashes).toHaveLength(2)

    const receipts = await receiptsOf(result)
    expect(receipts.map((r) => r.status)).toEqual(['0x1', '0x1'])
    const txs = await Promise.all(result.transactionHashes.map(transactionOf))
    expect(txs.map((tx) => [tx.from, tx.to])).toEqual([
      [account, X],
      [account, Y],
    ])
    expect(await node.getBalance(X)).toBe(xBefore + parseEther('1'))
    expect(await node.getBalance(Y)).toBe(yBefore + parseEther('2'))
    // Nothing went through the sponsor.
    expect(await node.getBalance(DEVWALLET_SPONSOR)).toBe(0n)
  })

  test('a call can depend on an earlier one in the batch', async () => {
    const deployed = await executeCalls(
      input({
        account: plainAccount(DEV_ACCOUNTS[0]),
        calls: [
          {
            data: encodeDeployData({
              abi: MockERC20.abi,
              bytecode: MockERC20.bytecode.object as Hex,
              args: ['Mock', 'MCK', 18],
            }),
          },
        ],
      }),
    )
    const [deployment] = await receiptsOf(deployed)
    const token = deployment?.contractAddress as Address
    const call = (functionName: 'mint' | 'transfer', to: Address): Call => ({
      to: token,
      data: encodeFunctionData({
        abi: MockERC20.abi,
        functionName,
        args: [to, 10n],
      }),
    })
    // The account holds no tokens: the transfer only works after the mint.
    const calls = [call('mint', account), call('transfer', Y)]

    const result = await executeCalls(
      input({ account: plainAccount(), calls }),
    )

    expect(result).toMatchObject({
      path: 'sequential',
      simulation: { ok: true },
    })
    expect(result.transactionHashes).toHaveLength(2)
    const receipts = await receiptsOf(result)
    expect(receipts.map((r) => r.status)).toEqual(['0x1', '0x1'])
    const balance = await node.request<Hex>('eth_call', [
      {
        to: token,
        data: encodeFunctionData({
          abi: MockERC20.abi,
          functionName: 'balanceOf',
          args: [Y],
        }),
      },
      'latest',
    ])
    expect(hexToBigInt(balance)).toBe(10n)
  })

  test('a kernel account in a plain mode also sends sequentially', async () => {
    const plan = await planExecution(
      input({
        account: {
          address: account,
          mode: 'plain-never',
          onchain: { kind: 'kernel' },
          canSign: true,
        },
      }),
    )
    expect(plan.path).toBe('sequential')
  })

  test('a failing call is refused with code 3', async () => {
    const before = await node.blockNumber()
    const calls: Call[] = [{ to: X, value: 1n }, { to: REVERTER }]

    const error = await rejection(
      executeCalls(input({ account: plainAccount(), calls })),
    )

    expect(error.code).toBe(3)
    expect(error.data).toBe(REVERT_DATA)
    expect(await node.blockNumber()).toBe(before)
  })

  test('with force, the failing call is sent with an explicit gas limit', async () => {
    const xBefore = await node.getBalance(X)
    const calls: Call[] = [{ to: X, value: 1n }, { to: REVERTER }]

    const result = await executeCalls(
      input({ account: plainAccount(), calls, force: true }),
    )

    expect(result.path).toBe('sequential')
    expect(result.transactionHashes).toHaveLength(2)
    const receipts = await receiptsOf(result)
    expect(receipts.map((r) => r.status)).toEqual(['0x1', '0x0'])
    expect(await node.getBalance(X)).toBe(xBefore + 1n)
    const txs = await Promise.all(result.transactionHashes.map(transactionOf))
    expect(hexToBigInt(txs[1]?.gas as Hex)).toBe(1_000_000n)
    expect(hexToBigInt(txs[0]?.gas as Hex)).not.toBe(1_000_000n)
  })

  test('an account the node holds no key for is impersonated first', async () => {
    await node.setBalance(FRESH, parseEther('5'))
    const result = await executeCalls(
      input({ account: plainAccount(FRESH), sponsor: OFF }),
    )
    const [receipt] = await receiptsOf(result)
    expect(receipt?.status).toBe('0x1')
    expect(
      (await transactionOf(result.transactionHashes[0] as Hex)).from,
    ).toBe(FRESH)
  })
})

describe('rule 3: a failing simulation is refused', () => {
  const calls: Call[] = [{ to: X, value: parseEther('1') }, { to: REVERTER }]

  test('code 3, the revert data, and nothing mined', async () => {
    const simulation = await simulateCalls(node, {
      from: account,
      atomic: true,
      calls,
    })
    expect(simulation).toMatchObject({ ok: false, revertData: REVERT_DATA })
    const before = await node.blockNumber()

    for (const run of [planExecution, executeCalls]) {
      const error = await rejection(run(input({ calls })))
      expect(error.code).toBe(3)
      expect(error.data).toBe(REVERT_DATA)
      expect(error.message).toBe(
        (simulation as { message: string }).message,
      )
    }
    expect(await node.blockNumber()).toBe(before)
    // The sponsor is not even funded for a send that is refused.
    expect(await node.getBalance(DEVWALLET_SPONSOR)).toBe(0n)
  })
})

describe('rule 4: force sends a failing call through the account', () => {
  test('self-call that reverts on chain, even with sponsorship on', async () => {
    const accountBefore = await node.getBalance(account)
    const xBefore = await node.getBalance(X)
    const calls: Call[] = [{ to: X, value: parseEther('1') }, { to: REVERTER }]

    const result = await executeCalls(input({ calls, force: true }))

    expect(result).toMatchObject({
      path: 'self-call',
      payer: account,
      sponsored: false,
      simulation: { ok: false, revertData: REVERT_DATA },
    })
    expect(result.userOpHash).toBeUndefined()
    expect(result.transactionHashes).toHaveLength(1)

    const [receipt] = await receiptsOf(result)
    expect(receipt?.status).toBe('0x0')
    const tx = await transactionOf(result.transactionHashes[0] as Hex)
    expect(tx).toMatchObject({ from: account, to: account })
    // Explicit gas, so the node mines the revert instead of refusing it.
    expect(hexToBigInt(tx.gas)).toBe(1_000_000n)
    // The batch rolled back, so only gas was spent.
    expect(await node.getBalance(X)).toBe(xBefore)
    const spent = accountBefore - (await node.getBalance(account))
    expect(spent).toBeGreaterThan(0n)
    expect(spent).toBeLessThan(parseEther('0.01'))
  })

  test('says why it is not sponsored when sponsorship is on', async () => {
    const calls: Call[] = [{ to: REVERTER }]
    const on = await planExecution(input({ calls, force: true }))
    const off = await planExecution(
      input({ calls, force: true, sponsor: OFF }),
    )
    expect(on.fallbackReason).toMatch(/revert/i)
    expect(off.fallbackReason).toBeUndefined()
  })

  test('has no effect on a call that would succeed', async () => {
    const plan = await planExecution(input({ force: true }))
    expect(plan).toMatchObject({ path: 'userop', sponsored: true })
  })
})

describe('rule 5: a signing account with sponsorship goes through a user op', () => {
  test('the sponsor pays the gas, the account only the value', async () => {
    const accountBefore = await node.getBalance(account)
    const xBefore = await node.getBalance(X)

    const result = await executeCalls(input())

    expect(result).toMatchObject({
      path: 'userop',
      payer: DEVWALLET_SPONSOR,
      sponsored: true,
      simulation: { ok: true },
    })
    expect(result.fallbackReason).toBeUndefined()
    expect(result.userOpHash).toBeString()
    expect(result.transactionHashes).toHaveLength(1)

    const hash = result.transactionHashes[0] as Hex
    const [receipt] = await receiptsOf(result)
    expect(receipt?.status).toBe('0x1')
    expect(await transactionOf(hash)).toMatchObject({
      from: DEVWALLET_SPONSOR,
      to: ENTRY_POINT_07,
    })
    expect(
      await getUserOpOutcome(node, hash, result.userOpHash as Hex),
    ).toMatchObject({ success: true, paymaster: DEVWALLET_PAYMASTER })
    expect(await node.getBalance(X)).toBe(xBefore + parseEther('1'))
    expect(await node.getBalance(account)).toBe(accountBefore - parseEther('1'))
  })

  test('an account sponsor with enough ETH is the payer', async () => {
    const sponsorAccount = DEV_ACCOUNTS[2]
    const result = await executeCalls(
      input({ sponsor: { kind: 'account', address: sponsorAccount } }),
    )
    expect(result).toMatchObject({
      path: 'userop',
      payer: sponsorAccount,
      sponsored: true,
    })
    const tx = await transactionOf(result.transactionHashes[0] as Hex)
    expect(tx.from).toBe(sponsorAccount)
  })
})

describe('rule 6: an account that cannot sign pays its own gas', () => {
  const expected = {
    path: 'self-call',
    sponsored: false,
    fallbackReason: IMPERSONATED_REASON,
  } as const

  test('is planned as a self-call with the reason', async () => {
    const impersonated = await impersonatedKernel()
    expect(await planExecution(input({ account: impersonated }))).toMatchObject(
      { ...expected, payer: FRESH, simulation: { ok: true } },
    )
  })

  test('the account calls itself, is impersonated, and pays', async () => {
    const impersonated = await impersonatedKernel()
    const before = await node.getBalance(FRESH)
    const xBefore = await node.getBalance(X)

    const result = await executeCalls(input({ account: impersonated }))

    expect(result).toMatchObject({ ...expected, payer: FRESH })
    expect(result.userOpHash).toBeUndefined()
    const [receipt] = await receiptsOf(result)
    expect(receipt?.status).toBe('0x1')
    const tx = await transactionOf(result.transactionHashes[0] as Hex)
    expect(tx).toMatchObject({ from: FRESH, to: FRESH })
    expect(hexToBigInt(tx.value)).toBe(0n)
    expect(await node.getBalance(X)).toBe(xBefore + parseEther('1'))
    // The value and the gas both came from the account.
    expect(await node.getBalance(FRESH)).toBeLessThan(before - parseEther('1'))
    expect(await node.getBalance(DEVWALLET_SPONSOR)).toBe(0n)
  })

  test('with sponsorship off there is nothing to explain', async () => {
    const impersonated = await impersonatedKernel()
    const plan = await planExecution(
      input({ account: impersonated, sponsor: OFF }),
    )
    expect(plan.path).toBe('self-call')
    expect(plan.fallbackReason).toBeUndefined()
  })
})

describe('rule 7: sponsorship off', () => {
  test('self-call from the account, with no reason given', async () => {
    const accountBefore = await node.getBalance(account)
    const xBefore = await node.getBalance(X)

    const result = await executeCalls(input({ sponsor: OFF }))

    expect(result).toMatchObject({
      path: 'self-call',
      payer: account,
      sponsored: false,
      simulation: { ok: true },
    })
    expect(result.fallbackReason).toBeUndefined()
    expect(result.userOpHash).toBeUndefined()
    expect(result.transactionHashes).toHaveLength(1)

    const [receipt] = await receiptsOf(result)
    expect(receipt?.status).toBe('0x1')
    const tx = await transactionOf(result.transactionHashes[0] as Hex)
    expect(tx).toMatchObject({ from: account, to: account })
    expect(await node.getBalance(X)).toBe(xBefore + parseEther('1'))
    expect(await node.getBalance(account)).toBeLessThan(
      accountBefore - parseEther('1'),
    )
  })

  test('the batch is atomic', async () => {
    const calls: Call[] = [
      { to: X, value: 1n },
      { to: Y, value: 2n },
    ]
    const xBefore = await node.getBalance(X)
    const yBefore = await node.getBalance(Y)
    const result = await executeCalls(input({ sponsor: OFF, calls }))
    expect(result.transactionHashes).toHaveLength(1)
    await receiptsOf(result)
    expect(await node.getBalance(X)).toBe(xBefore + 1n)
    expect(await node.getBalance(Y)).toBe(yBefore + 2n)
  })
})

describe('rule 8: a sponsor that cannot pay falls back to a self-call', () => {
  const sponsor: SponsorSetting = { kind: 'account', address: FRESH }

  test('the plan carries the sponsor plan reason', async () => {
    const assessed = await assessSponsor(node, sponsor)
    expect(assessed.ok).toBe(false)
    if (assessed.ok) return

    const plan = await planExecution(input({ sponsor }))

    expect(plan).toMatchObject({
      path: 'self-call',
      payer: account,
      sponsored: false,
      fallbackReason: assessed.reason,
    })
    expect(plan.fallbackReason).toMatch(/too little ETH/)
    expect(plan.fallbackReason).toContain(FRESH)
  })

  test('executeCalls then sends the self-call', async () => {
    const result = await executeCalls(input({ sponsor }))
    expect(result).toMatchObject({ path: 'self-call', sponsored: false })
    expect(result.fallbackReason).toMatch(/too little ETH/)
    const [receipt] = await receiptsOf(result)
    expect(receipt?.status).toBe('0x1')
  })
})

describe('funding the sponsor at send time', () => {
  test('a sponsor that cannot be funded falls back to a self-call', async () => {
    const refusing: Node = {
      ...node,
      setBalance: async () => {
        throw new Error('setBalance refused')
      },
    }
    // The plan can't know: assessSponsor says a devwallet sponsor is fundable.
    expect(await planExecution(input({ node: refusing }))).toMatchObject({
      path: 'userop',
      sponsored: true,
    })

    const result = await executeCalls(input({ node: refusing }))

    expect(result).toMatchObject({
      path: 'self-call',
      payer: account,
      sponsored: false,
      fallbackReason: "Couldn't fund the sponsor: setBalance refused",
    })
    expect(result.userOpHash).toBeUndefined()
    expect(
      await transactionOf(result.transactionHashes[0] as Hex),
    ).toMatchObject({ from: account, to: account })
  })
})

describe('planExecution sends nothing', () => {
  test('no writes, no new blocks, no balance changes', async () => {
    const impersonated = await impersonatedKernel()
    const writes: string[] = []
    const recording: Node = {
      ...node,
      request: async <T>(method: string, params?: unknown[]) => {
        if (/^(anvil|hardhat)_|^eth_send|^eth_sign/.test(method))
          writes.push(method)
        return node.request<T>(method, params)
      },
      setBalance: async (a) => void writes.push(`setBalance ${a}`),
      setCode: async (a) => void writes.push(`setCode ${a}`),
      impersonate: async (a) => void writes.push(`impersonate ${a}`),
    }
    const watched = [account, DEVWALLET_SPONSOR, DEVWALLET_PAYMASTER, FRESH, X]
    const snapshot = async () => ({
      block: await node.blockNumber(),
      balances: await Promise.all(watched.map((a) => node.getBalance(a))),
    })
    const before = await snapshot()

    const deploy: Call = { data: PAYABLE_INIT }
    const scenarios: Partial<ExecuteInput>[] = [
      {},
      { sponsor: OFF },
      { sponsor: { kind: 'account', address: FRESH } },
      { sponsor: { kind: 'account', address: DEV_ACCOUNTS[3] } },
      { force: true, calls: [{ to: REVERTER }] },
      { account: plainAccount() },
      { calls: [deploy] },
      { account: impersonated },
    ]
    for (const scenario of scenarios) {
      await planExecution({ ...input(scenario), node: recording })
    }

    expect(writes).toEqual([])
    expect(await snapshot()).toEqual(before)
  })
})
