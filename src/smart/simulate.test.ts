import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  type Address,
  type Hex,
  concat,
  encodeAbiParameters,
  encodeDeployData,
  encodeFunctionData,
  getAddress,
  numberToHex,
  parseEther,
  size,
} from 'viem'

import { MockERC20 } from '../../test/contracts/generated'
import { KERNEL_V3_3 } from './constants'
import { WalletRpcError } from './errors'
import { setDelegation } from './kernel'
import { type Node, connectNode } from './node'
import { simulateCalls } from './simulate'
import { ensureAaContracts } from './setup'
import { DEV_ACCOUNTS, startAnvil, waitForReceipt } from './testing/anvil'
import type { Call } from './types'

const account = DEV_ACCOUNTS[1]
const X = getAddress('0x00000000000000000000000000000000000a0a0a')
const Y = getAddress('0x00000000000000000000000000000000000b0b0b')
// Runtime code `PUSH0 PUSH0 REVERT`: reverts with no data.
const REVERTER = getAddress('0x00000000000000000000000000000000000dead0')
const REVERTER_CODE = '0x5f5ffd'

let anvil: { rpcUrl: string; stop(): Promise<void> }
let node: Node
let token: Address

async function send(from: Address, to: Address | undefined, data: Hex) {
  const hash = await node.request<Hex>('eth_sendTransaction', [
    { from, ...(to && { to }), data },
  ])
  return waitForReceipt(node, hash)
}

const transfer = (to: Address, amount: bigint): Call => ({
  to: token,
  data: encodeFunctionData({
    abi: MockERC20.abi,
    functionName: 'transfer',
    args: [to, amount],
  }),
})

async function tokenBalance(owner: Address): Promise<bigint> {
  const result = await node.request<Hex>('eth_call', [
    {
      to: token,
      data: encodeFunctionData({
        abi: MockERC20.abi,
        functionName: 'balanceOf',
        args: [owner],
      }),
    },
    'latest',
  ])
  return BigInt(result)
}

beforeEach(async () => {
  anvil = await startAnvil()
  node = await connectNode({ rpcUrl: anvil.rpcUrl })
  await ensureAaContracts(node)
  await setDelegation(node, account, KERNEL_V3_3)
  await node.setCode(REVERTER, REVERTER_CODE)

  const deployed = await send(
    DEV_ACCOUNTS[0],
    undefined,
    encodeDeployData({
      abi: MockERC20.abi,
      bytecode: MockERC20.bytecode.object as Hex,
      args: ['Mock', 'MCK', 18],
    }),
  )
  token = getAddress(deployed.contractAddress as Address)
  await send(
    DEV_ACCOUNTS[0],
    token,
    encodeFunctionData({
      abi: MockERC20.abi,
      functionName: 'mint',
      args: [account, 100n],
    }),
  )
})
afterEach(() => anvil.stop())

/** A node whose `eth_simulateV1` fails the way a node without it would. */
function withoutSimulateV1(): { node: Node; simulateRequests: () => number } {
  let count = 0
  return {
    node: {
      ...node,
      request: (method, params) => {
        if (method === 'eth_simulateV1') {
          count++
          return Promise.reject(new WalletRpcError(-32601, 'Method not found'))
        }
        return node.request(method, params)
      },
    },
    simulateRequests: () => count,
  }
}

describe('simulateCalls (eth_simulateV1)', () => {
  test('reports gas and the account balance changes without mining', async () => {
    const block = await node.blockNumber()
    const result = await simulateCalls(node, {
      from: account,
      atomic: true,
      calls: [{ to: X, value: parseEther('1') }, transfer(Y, 5n)],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.gasUsed).toBeGreaterThan(0n)
    expect(result.balanceChanges).toHaveLength(2)
    expect(result.balanceChanges).toContainEqual({
      token: 'native',
      delta: -parseEther('1'),
    })
    expect(result.balanceChanges).toContainEqual({ token, delta: -5n })
    // Nothing was mined.
    expect(await node.getBalance(X)).toBe(0n)
    expect(await tokenBalance(Y)).toBe(0n)
    expect(await node.blockNumber()).toBe(block)
  })

  test('counts incoming transfers as positive changes', async () => {
    const result = await simulateCalls(node, {
      from: account,
      atomic: true,
      calls: [
        {
          to: token,
          data: encodeFunctionData({
            abi: MockERC20.abi,
            functionName: 'mint',
            args: [account, 5n],
          }),
        },
      ],
    })
    expect(result).toMatchObject({
      ok: true,
      balanceChanges: [{ token, delta: 5n }],
    })
  })

  test('sums transfers per token; a transfer to itself changes nothing', async () => {
    const result = await simulateCalls(node, {
      from: account,
      atomic: true,
      calls: [transfer(Y, 5n), transfer(account, 5n), transfer(Y, 3n)],
    })
    expect(result).toMatchObject({
      ok: true,
      balanceChanges: [{ token, delta: -8n }],
    })
  })

  test('a failing call fails the batch at its index', async () => {
    const result = await simulateCalls(node, {
      from: account,
      atomic: true,
      calls: [{ to: X, value: 1n }, { to: REVERTER }],
    })
    expect(result).toMatchObject({ ok: false, failedIndex: 1 })
  })

  test('decodes a Panic revert into the message', async () => {
    const result = await simulateCalls(node, {
      from: account,
      atomic: true,
      calls: [transfer(Y, 1000n)],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failedIndex).toBe(0)
    expect(result.revertData).toStartWith('0x4e487b71')
    expect(result.message).toBe(
      'Call 1 reverted: arithmetic overflow or underflow',
    )
  })

  test('decodes an Error(string) revert into the message', async () => {
    const reason = concat([
      '0x08c379a0',
      encodeAbiParameters([{ type: 'string' }], ['nope']),
    ])
    // Runtime code that copies the reason (stored after it) and reverts with it:
    // PUSH1 len, PUSH1 10, PUSH0, CODECOPY, PUSH1 len, PUSH0, REVERT.
    const len = numberToHex(size(reason), { size: 1 })
    await node.setCode(
      REVERTER,
      concat(['0x60', len, '0x600a5f39', '0x60', len, '0x5ffd', reason]),
    )

    const result = await simulateCalls(node, {
      from: account,
      atomic: true,
      calls: [{ to: X }, { to: REVERTER }],
    })
    expect(result).toMatchObject({
      ok: false,
      failedIndex: 1,
      revertData: reason,
      message: 'Call 2 reverted: nope',
    })
  })

  test('atomic: false simulates each call alone, without carrying state', async () => {
    // The account holds 7: two transfers of 5 can't both land in one batch.
    await send(
      DEV_ACCOUNTS[0],
      token,
      encodeFunctionData({
        abi: MockERC20.abi,
        functionName: 'burn',
        args: [account, 93n],
      }),
    )
    expect(await tokenBalance(account)).toBe(7n)
    const calls = [transfer(Y, 5n), transfer(Y, 5n)]

    expect(
      await simulateCalls(node, { from: account, atomic: true, calls }),
    ).toMatchObject({ ok: false, failedIndex: 1 })
    const result = await simulateCalls(node, {
      from: account,
      atomic: false,
      calls,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.gasUsed).toBeGreaterThan(0n)
  })

  test('atomic: false reports the first failing call', async () => {
    const result = await simulateCalls(node, {
      from: account,
      atomic: false,
      calls: [{ to: X, value: 1n }, { to: REVERTER }, { to: Y }],
    })
    expect(result).toMatchObject({ ok: false, failedIndex: 1 })
  })

  test('a node error other than a missing method is a failure, not a fallback', async () => {
    const failing: Node = {
      ...node,
      request: (method, params) =>
        method === 'eth_simulateV1'
          ? Promise.reject(new WalletRpcError(-32602, 'bad params', '0xabcd'))
          : node.request(method, params),
    }
    const result = await simulateCalls(failing, {
      from: account,
      atomic: true,
      calls: [{ to: X }],
    })
    expect(result).toEqual({
      ok: false,
      failedIndex: null,
      revertData: '0xabcd',
      message: 'bad params',
    })
  })
})

describe('simulateCalls (without eth_simulateV1)', () => {
  test('atomic success has no gas or balance changes', async () => {
    const result = await simulateCalls(withoutSimulateV1().node, {
      from: account,
      atomic: true,
      calls: [{ to: X, value: 1n }, transfer(Y, 5n)],
    })
    expect(result).toEqual({ ok: true, gasUsed: null, balanceChanges: null })
  })

  test('atomic failure keeps the revert data but not the index', async () => {
    const result = await simulateCalls(withoutSimulateV1().node, {
      from: account,
      atomic: true,
      calls: [{ to: X, value: 1n }, { to: REVERTER }],
    })
    expect(result).toMatchObject({ ok: false, failedIndex: null })
    if (result.ok) return
    expect(result.revertData).not.toBeNull()
    expect(result.message).toBeTruthy()
  })

  test('atomic failure decodes the revert reason', async () => {
    const result = await simulateCalls(withoutSimulateV1().node, {
      from: account,
      atomic: true,
      calls: [transfer(Y, 1000n)],
    })
    expect(result).toMatchObject({ ok: false, failedIndex: null })
    if (result.ok) return
    expect(result.revertData).toStartWith('0x4e487b71')
    expect(result.message).toBe(
      'Batch reverted: arithmetic overflow or underflow',
    )
  })

  test('atomic simulation of a contract deployment fails with a clear message', async () => {
    const result = await simulateCalls(withoutSimulateV1().node, {
      from: account,
      atomic: true,
      calls: [{ data: '0x60005ff3' }],
    })
    expect(result).toMatchObject({ ok: false, failedIndex: null })
    if (result.ok) return
    expect(result.message).toContain('deployment')
  })

  test('non-atomic simulates each call and reports the failing one', async () => {
    const { node: bare } = withoutSimulateV1()
    expect(
      await simulateCalls(bare, {
        from: account,
        atomic: false,
        calls: [{ to: X, value: 1n }, transfer(Y, 5n)],
      }),
    ).toEqual({ ok: true, gasUsed: null, balanceChanges: null })
    expect(
      await simulateCalls(bare, {
        from: account,
        atomic: false,
        calls: [{ to: X, value: 1n }, { to: REVERTER }],
      }),
    ).toMatchObject({ ok: false, failedIndex: 1 })
  })

  test('the missing method is remembered for the node url', async () => {
    const { node: bare, simulateRequests } = withoutSimulateV1()
    const args = { from: account, atomic: true, calls: [{ to: X }] }
    await simulateCalls(bare, args)
    await simulateCalls(bare, args)
    expect(simulateRequests()).toBe(1)
  })

  test('a differently worded missing-method error is also a fallback', async () => {
    const hardhat: Node = {
      ...node,
      request: (method, params) =>
        method === 'eth_simulateV1'
          ? Promise.reject(
              new WalletRpcError(
                -32000,
                'The method eth_simulateV1 does not exist/is not available',
              ),
            )
          : node.request(method, params),
    }
    const result = await simulateCalls(hardhat, {
      from: account,
      atomic: true,
      calls: [{ to: X }],
    })
    expect(result).toEqual({ ok: true, gasUsed: null, balanceChanges: null })
  })
})
