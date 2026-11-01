import {
  afterEach,
  beforeEach,
  describe,
  expect,
  setSystemTime,
  test,
} from 'bun:test'
import {
  type Address,
  type Hex,
  concat,
  encodeAbiParameters,
  encodeDeployData,
  encodeFunctionData,
  getAddress,
  numberToHex,
  pad,
  parseEther,
  size,
  toEventSelector,
} from 'viem'

import { MockERC20 } from '../../test/contracts/generated'
import { KERNEL_V3_3 } from './constants'
import { WalletRpcError } from './errors'
import { setDelegation } from './kernel'
import { type Node, connectNode } from './node'
import { UNSUPPORTED_RETRY_MS, simulateCalls } from './simulate'
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

const mint = (to: Address, amount: bigint): Call => ({
  to: token,
  data: encodeFunctionData({
    abi: MockERC20.abi,
    functionName: 'mint',
    args: [to, amount],
  }),
})

/** Burns `amount` of `owner`'s tokens (anyone may, on the mock). */
async function burn(owner: Address, amount: bigint) {
  await send(
    DEV_ACCOUNTS[0],
    token,
    encodeFunctionData({
      abi: MockERC20.abi,
      functionName: 'burn',
      args: [owner, amount],
    }),
  )
}

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

/** `base`, but `method` always fails with `error`; counts those requests. */
function failing(
  base: Node,
  method: string,
  error: WalletRpcError,
): { node: Node; requests: () => number } {
  let count = 0
  return {
    node: {
      ...base,
      request: (m, params) => {
        if (m !== method) return base.request(m, params)
        count++
        return Promise.reject(error)
      },
    },
    requests: () => count,
  }
}

/** A node whose `eth_simulateV1` fails the way a node without it would. */
function withoutSimulateV1() {
  return failing(
    node,
    'eth_simulateV1',
    new WalletRpcError(-32601, 'Method not found'),
  )
}

/** `base`, but `eth_simulateV1` answers with `response`. */
function simulatingAs(response: unknown): Node {
  return {
    ...node,
    request: ((method, params) =>
      method === 'eth_simulateV1'
        ? Promise.resolve(response)
        : node.request(method, params)) as Node['request'],
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

  test('state carries in call order, whether or not the batch is atomic', async () => {
    // The account holds 7: two transfers of 5 can't both land.
    await burn(account, 93n)
    expect(await tokenBalance(account)).toBe(7n)
    const calls = [transfer(Y, 5n), transfer(Y, 5n)]

    for (const atomic of [true, false]) {
      expect(
        await simulateCalls(node, { from: account, atomic, calls }),
      ).toMatchObject({ ok: false, failedIndex: 1 })
    }
  })

  test('a call can depend on an earlier one, whether or not the batch is atomic', async () => {
    // The account starts with nothing, so the transfer only works after the mint.
    await burn(account, 100n)
    expect(await tokenBalance(account)).toBe(0n)
    const calls = [mint(account, 10n), transfer(Y, 10n)]

    for (const atomic of [true, false]) {
      const result = await simulateCalls(node, { from: account, atomic, calls })
      expect(result.ok).toBe(true)
      if (!result.ok) continue
      expect(result.gasUsed).toBeGreaterThan(0n)
      // Minted and sent on: no net change.
      expect(result.balanceChanges).toEqual([])
    }
  })

  test('both atomic values use a single eth_simulateV1 request', async () => {
    let simulations = 0
    const counting: Node = {
      ...node,
      request: ((method, params) => {
        if (method === 'eth_simulateV1') simulations++
        return node.request(method, params)
      }) as Node['request'],
    }
    for (const atomic of [true, false]) {
      simulations = 0
      await simulateCalls(counting, {
        from: account,
        atomic,
        calls: [{ to: X }, { to: Y }, transfer(Y, 1n)],
      })
      expect(simulations).toBe(1)
    }
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
    const { node: rejecting, requests } = failing(
      node,
      'eth_simulateV1',
      new WalletRpcError(-32602, 'bad params', '0xabcd'),
    )
    const args = { from: account, atomic: true, calls: [{ to: X }] }
    expect(await simulateCalls(rejecting, args)).toEqual({
      ok: false,
      failedIndex: null,
      revertData: '0xabcd',
      message: 'bad params',
    })
    // It didn't switch the method off: the next call asks the node again.
    await simulateCalls(rejecting, args)
    expect(requests()).toBe(2)
  })

  test('results that do not line up with the calls are a failure', async () => {
    const args = { from: account, atomic: true, calls: [{ to: X }] }
    for (const response of [[], [{ calls: [] }], [{}], null]) {
      const result = await simulateCalls(simulatingAs(response), args)
      expect(result).toMatchObject({ ok: false, failedIndex: null })
    }
    const result = await simulateCalls(
      simulatingAs([
        { calls: [{ status: '0x1', gasUsed: '0x5208', returnData: '0x' }] },
      ]),
      { ...args, calls: [{ to: X }, { to: Y }] },
    )
    expect(result).toEqual({
      ok: false,
      failedIndex: null,
      revertData: null,
      message: 'eth_simulateV1 returned 1 call results for 2 calls',
    })
  })

  test('transfer logs without a 32-byte amount are skipped', async () => {
    const transferLog = (data: Hex) => ({
      address: token,
      topics: [
        toEventSelector('Transfer(address,address,uint256)'),
        pad(account),
        pad(Y),
      ],
      data,
    })
    const result = await simulateCalls(
      simulatingAs([
        {
          calls: [
            {
              status: '0x1',
              gasUsed: '0x5208',
              returnData: '0x',
              logs: [
                transferLog('0x'),
                transferLog(pad('0x05')),
                transferLog(concat([pad('0x07'), '0x00'])),
              ],
            },
          ],
        },
      ]),
      { from: account, atomic: true, calls: [{ to: token }] },
    )
    expect(result).toEqual({
      ok: true,
      gasUsed: 0x5208n,
      balanceChanges: [{ token, delta: -5n }],
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

  test('a call that cannot be encoded keeps its own error message', async () => {
    const result = await simulateCalls(withoutSimulateV1().node, {
      from: account,
      atomic: true,
      calls: [{ to: '0x123' }],
    })
    expect(result).toMatchObject({ ok: false, failedIndex: null })
    if (result.ok) return
    expect(result.message).toContain('0x123')
    expect(result.message).not.toContain('deployment')
  })

  test('a node error that is not a revert is not reported as one', async () => {
    const limited = failing(
      withoutSimulateV1().node,
      'eth_call',
      new WalletRpcError(-32005, 'rate limited'),
    ).node
    for (const atomic of [true, false]) {
      expect(
        await simulateCalls(limited, {
          from: account,
          atomic,
          calls: [{ to: X }],
        }),
      ).toEqual({
        ok: false,
        failedIndex: null,
        revertData: null,
        message: 'rate limited',
      })
    }
  })

  test('a code 3 error is a revert even without revert data', async () => {
    const reverting = failing(
      withoutSimulateV1().node,
      'eth_call',
      new WalletRpcError(3, 'execution reverted'),
    ).node
    expect(
      await simulateCalls(reverting, {
        from: account,
        atomic: false,
        calls: [{ to: X }],
      }),
    ).toEqual({
      ok: false,
      failedIndex: 0,
      revertData: null,
      message: 'Call 1 reverted',
    })
  })

  test('non-atomic calls each call in turn and reports a first-call failure', async () => {
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
        calls: [{ to: REVERTER }, { to: X }],
      }),
    ).toMatchObject({ ok: false, failedIndex: 0 })
  })

  test('non-atomic cannot tell that a later revert is only for want of earlier state', async () => {
    await burn(account, 100n)
    const { node: bare } = withoutSimulateV1()
    const calls = [mint(account, 10n), transfer(Y, 10n)]
    // Alone, the transfer reverts (the account holds nothing); after the mint
    // it works, but `eth_call` can't see that.
    expect(
      await simulateCalls(bare, {
        from: account,
        atomic: false,
        calls: [transfer(Y, 10n)],
      }),
    ).toMatchObject({ ok: false, failedIndex: 0 })
    expect(
      await simulateCalls(bare, { from: account, atomic: false, calls }),
    ).toEqual({ ok: true, gasUsed: null, balanceChanges: null })
    expect(
      await simulateCalls(bare, {
        from: account,
        atomic: false,
        calls: [{ to: X }, { to: REVERTER }],
      }),
    ).toEqual({ ok: true, gasUsed: null, balanceChanges: null })
  })

  test('non-atomic still reports a node error on a later call', async () => {
    const { node: bare } = withoutSimulateV1()
    let ethCalls = 0
    const limited: Node = {
      ...bare,
      request: ((method, params) =>
        method === 'eth_call' && ++ethCalls === 2
          ? Promise.reject(new WalletRpcError(-32005, 'rate limited'))
          : bare.request(method, params)) as Node['request'],
    }
    expect(
      await simulateCalls(limited, {
        from: account,
        atomic: false,
        calls: [{ to: X }, { to: Y }],
      }),
    ).toEqual({
      ok: false,
      failedIndex: null,
      revertData: null,
      message: 'rate limited',
    })
  })

  test('the missing method is remembered for the node url, for a while', async () => {
    const { node: bare, requests } = withoutSimulateV1()
    const args = { from: account, atomic: true, calls: [{ to: X }] }
    await simulateCalls(bare, args)
    await simulateCalls(bare, args)
    expect(requests()).toBe(1)

    try {
      setSystemTime(new Date(Date.now() + UNSUPPORTED_RETRY_MS + 1))
      await simulateCalls(bare, args)
    } finally {
      setSystemTime()
    }
    expect(requests()).toBe(2)
  })

  test('a message that names eth_simulateV1 as missing is also a fallback', async () => {
    const { node: hardhat, requests } = failing(
      node,
      'eth_simulateV1',
      new WalletRpcError(
        -32000,
        'The method eth_simulateV1 does not exist/is not available',
      ),
    )
    const args = { from: account, atomic: true, calls: [{ to: X }] }
    const expected = { ok: true, gasUsed: null, balanceChanges: null } as const
    expect(await simulateCalls(hardhat, args)).toEqual(expected)
    expect(await simulateCalls(hardhat, args)).toEqual(expected)
    expect(requests()).toBe(1)
  })

  test('a "not supported" message about something else does not disable it', async () => {
    const { node: picky, requests } = failing(
      node,
      'eth_simulateV1',
      new WalletRpcError(-32000, 'method foo not supported'),
    )
    const args = { from: account, atomic: true, calls: [{ to: X }] }
    const expected = {
      ok: false,
      failedIndex: null,
      revertData: null,
      message: 'method foo not supported',
    } as const
    expect(await simulateCalls(picky, args)).toEqual(expected)
    expect(await simulateCalls(picky, args)).toEqual(expected)
    expect(requests()).toBe(2)
  })
})
