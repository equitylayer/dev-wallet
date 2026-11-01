import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  type Address,
  type Hex,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  hexToBigInt,
  numberToHex,
  parseEther,
  recoverMessageAddress,
} from 'viem'
import {
  entryPoint07Abi,
  toPackedUserOperation,
} from 'viem/account-abstraction'

import {
  DEVWALLET_PAYMASTER,
  DEVWALLET_SPONSOR,
  ENTRY_POINT_07,
  KERNEL_V3_3,
} from './constants'
import { encodeKernelBatch, setDelegation } from './kernel'
import { type Node, connectNode } from './node'
import { ensureAaContracts } from './setup'
import {
  PAYMASTER_MIN_DEPOSIT,
  PAYMASTER_TOP_UP,
  SPONSOR_MIN_BALANCE,
  SPONSOR_TOP_UP,
  assessSponsor,
  prepareSponsor,
} from './sponsor'
import { DEV_ACCOUNTS, startAnvil, waitForReceipt } from './testing/anvil'
import type { Call, SponsorSetting } from './types'
import {
  buildUserOp,
  getUserOpOutcome,
  signUserOp,
  submitUserOp,
} from './userop'

const account = DEV_ACCOUNTS[1]
const X = getAddress('0x00000000000000000000000000000000000a0a0a')
const FRESH = getAddress('0x00000000000000000000000000000000000f0f0f')
const REVERTER = getAddress('0x00000000000000000000000000000000000dead0')

let anvil: { rpcUrl: string; stop(): Promise<void> }
let node: Node

beforeEach(async () => {
  anvil = await startAnvil()
  node = await connectNode({ rpcUrl: anvil.rpcUrl })
  await ensureAaContracts(node)
  await setDelegation(node, account, KERNEL_V3_3)
})
afterEach(() => anvil.stop())

async function depositOf(address: Address): Promise<bigint> {
  const result = await node.request<Hex>('eth_call', [
    {
      to: ENTRY_POINT_07,
      data: encodeFunctionData({
        abi: entryPoint07Abi,
        functionName: 'balanceOf',
        args: [address],
      }),
    },
    'latest',
  ])
  return decodeFunctionResult({
    abi: entryPoint07Abi,
    functionName: 'balanceOf',
    data: result,
  })
}

describe('prepareSponsor', () => {
  test('devwallet funds the sponsor and the paymaster deposit', async () => {
    expect(await prepareSponsor(node, { kind: 'devwallet' })).toEqual({
      ok: true,
      sender: DEVWALLET_SPONSOR,
    })
    expect(await node.getBalance(DEVWALLET_SPONSOR)).toBeGreaterThanOrEqual(
      SPONSOR_MIN_BALANCE,
    )
    expect(await depositOf(DEVWALLET_PAYMASTER)).toBeGreaterThanOrEqual(
      PAYMASTER_MIN_DEPOSIT,
    )
  })

  test('devwallet tops a low sponsor balance up to SPONSOR_TOP_UP', async () => {
    await node.setBalance(DEVWALLET_SPONSOR, parseEther('1'))
    await prepareSponsor(node, { kind: 'devwallet' })
    // The top-up replaces the balance; the deposit and gas come out of it.
    const balance = await node.getBalance(DEVWALLET_SPONSOR)
    expect(balance).toBeGreaterThan(
      SPONSOR_TOP_UP - PAYMASTER_TOP_UP - parseEther('0.1'),
    )
    expect(balance).toBeLessThan(SPONSOR_TOP_UP)
  })

  test('devwallet leaves funded balances alone', async () => {
    await prepareSponsor(node, { kind: 'devwallet' })
    const balance = await node.getBalance(DEVWALLET_SPONSOR)
    expect(await prepareSponsor(node, { kind: 'devwallet' })).toEqual({
      ok: true,
      sender: DEVWALLET_SPONSOR,
    })
    expect(await node.getBalance(DEVWALLET_SPONSOR)).toBe(balance)
    expect(await depositOf(DEVWALLET_PAYMASTER)).toBe(PAYMASTER_TOP_UP)
  })

  test('off reports that sponsorship is off', async () => {
    expect(await prepareSponsor(node, { kind: 'off' })).toEqual({
      ok: false,
      reason: 'Sponsorship is off.',
    })
  })

  test('an account with no ETH cannot sponsor', async () => {
    const plan = await prepareSponsor(node, { kind: 'account', address: FRESH })
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.reason).toMatch(/too little ETH/)
    expect(plan.reason).toContain(FRESH)
    expect(await depositOf(DEVWALLET_PAYMASTER)).toBe(0n)
  })

  test('a node error while funding is returned, not thrown', async () => {
    const refusing: Node = {
      ...node,
      setBalance: async () => {
        throw new Error('setBalance refused')
      },
    }
    expect(await prepareSponsor(refusing, { kind: 'devwallet' })).toEqual({
      ok: false,
      reason: "Couldn't fund the sponsor: setBalance refused",
    })
  })

  test('a node dev account sponsors without being impersonated', async () => {
    const sponsor = DEV_ACCOUNTS[2]
    const before = await node.getBalance(sponsor)
    expect(
      await prepareSponsor(node, { kind: 'account', address: sponsor }),
    ).toEqual({ ok: true, sender: sponsor })
    expect(await depositOf(DEVWALLET_PAYMASTER)).toBe(PAYMASTER_TOP_UP)
    expect(await node.getBalance(sponsor)).toBeLessThan(
      before - PAYMASTER_TOP_UP,
    )
  })

  test('an account without a node key is impersonated to fund the deposit', async () => {
    await node.setBalance(FRESH, parseEther('20'))
    expect(
      await prepareSponsor(node, { kind: 'account', address: FRESH }),
    ).toEqual({ ok: true, sender: FRESH })
    expect(await depositOf(DEVWALLET_PAYMASTER)).toBe(PAYMASTER_TOP_UP)
  })

  test('an account needs the top-up plus gas money while the deposit is short', async () => {
    await node.setBalance(FRESH, parseEther('5'))
    const plan = await prepareSponsor(node, { kind: 'account', address: FRESH })
    expect(plan.ok).toBe(false)
    expect(await depositOf(DEVWALLET_PAYMASTER)).toBe(0n)
  })

  test('an account only needs gas money once the deposit is funded', async () => {
    await prepareSponsor(node, { kind: 'devwallet' })
    await node.setBalance(FRESH, parseEther('0.5'))
    expect(
      await prepareSponsor(node, { kind: 'account', address: FRESH }),
    ).toEqual({ ok: true, sender: FRESH })
    expect(await node.getBalance(FRESH)).toBe(parseEther('0.5'))
  })
})

describe('assessSponsor', () => {
  test('off reports that sponsorship is off', async () => {
    expect(await assessSponsor(node, { kind: 'off' })).toEqual({
      ok: false,
      reason: 'Sponsorship is off.',
    })
  })

  test('devwallet can always be funded', async () => {
    expect(await assessSponsor(node, { kind: 'devwallet' })).toEqual({
      ok: true,
      sender: DEVWALLET_SPONSOR,
    })
  })

  test('an account with no ETH cannot sponsor', async () => {
    const plan = await assessSponsor(node, { kind: 'account', address: FRESH })
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.reason).toMatch(/too little ETH/)
  })

  test('applies the same thresholds as prepareSponsor', async () => {
    const setting = { kind: 'account', address: FRESH } as const

    // Deposit unfunded: the top-up has to come out of this account.
    await node.setBalance(FRESH, parseEther('5'))
    expect((await assessSponsor(node, setting)).ok).toBe(false)
    await node.setBalance(FRESH, parseEther('10.1'))
    expect(await assessSponsor(node, setting)).toEqual({
      ok: true,
      sender: FRESH,
    })

    // Deposit funded: only gas money is needed.
    await prepareSponsor(node, { kind: 'devwallet' })
    await node.setBalance(FRESH, parseEther('0.05'))
    expect((await assessSponsor(node, setting)).ok).toBe(false)
    await node.setBalance(FRESH, parseEther('0.1'))
    expect(await assessSponsor(node, setting)).toEqual({
      ok: true,
      sender: FRESH,
    })
  })

  test('changes no balances', async () => {
    await node.setBalance(FRESH, parseEther('20'))
    const watched = [DEVWALLET_SPONSOR, FRESH, DEV_ACCOUNTS[0], account]
    const snapshot = async () => ({
      balances: await Promise.all(watched.map((a) => node.getBalance(a))),
      deposit: await depositOf(DEVWALLET_PAYMASTER),
      block: await node.blockNumber(),
    })

    const before = await snapshot()
    await assessSponsor(node, { kind: 'devwallet' })
    await assessSponsor(node, { kind: 'account', address: FRESH })
    await assessSponsor(node, { kind: 'account', address: account })
    await assessSponsor(node, { kind: 'off' })
    expect(await snapshot()).toEqual(before)
  })

  test('never sends, impersonates or sets anything', async () => {
    // Recorded rather than thrown: assessSponsor turns errors into plans.
    const writes: string[] = []
    const recording: Node = {
      ...node,
      request: async <T>(method: string, params?: unknown[]) => {
        if (/^(anvil|hardhat)_|^eth_send/.test(method)) writes.push(method)
        return node.request<T>(method, params)
      },
      setBalance: async (a) => void writes.push(`setBalance ${a}`),
      setCode: async (a) => void writes.push(`setCode ${a}`),
      impersonate: async (a) => void writes.push(`impersonate ${a}`),
    }

    expect(await assessSponsor(recording, { kind: 'devwallet' })).toMatchObject(
      { ok: true },
    )
    expect(
      await assessSponsor(recording, { kind: 'account', address: FRESH }),
    ).toMatchObject({ ok: false })
    // A funded account that the node has no key for would need impersonating.
    await node.setBalance(X, parseEther('20'))
    expect(
      await assessSponsor(recording, { kind: 'account', address: X }),
    ).toMatchObject({ ok: true })
    expect(writes).toEqual([])
  })

  test('a node error is returned, not thrown', async () => {
    const failing: Node = {
      ...node,
      getBalance: async () => {
        throw new Error('node went away')
      },
    }
    const plan = await assessSponsor(failing, {
      kind: 'account',
      address: FRESH,
    })
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.reason).toContain('node went away')
  })
})

describe('user operations', () => {
  async function run(
    calls: Call[],
    sponsor: SponsorSetting = { kind: 'devwallet' },
  ) {
    const plan = await prepareSponsor(node, sponsor)
    if (!plan.ok) throw new Error(plan.reason)
    const op = await buildUserOp(node, { sender: account, calls })
    const { signature, userOpHash } = await signUserOp(
      node,
      op,
      await node.chainId(),
    )
    const hash = await submitUserOp(node, {
      op: { ...op, signature },
      bundler: plan.sender,
    })
    const receipt = await waitForReceipt(node, hash)
    return {
      op,
      signature,
      userOpHash,
      hash,
      receipt,
      outcome: await getUserOpOutcome(node, hash, userOpHash),
    }
  }

  test('sponsored op moves value, not gas, from the account', async () => {
    const accountBefore = await node.getBalance(account)
    const xBefore = await node.getBalance(X)

    const { hash, receipt, outcome } = await run([
      { to: X, value: parseEther('1') },
    ])

    expect(await node.getBalance(X)).toBe(xBefore + parseEther('1'))
    expect(await node.getBalance(account)).toBe(accountBefore - parseEther('1'))

    const tx = await node.request<{ from: Address; to: Address }>(
      'eth_getTransactionByHash',
      [hash],
    )
    expect(getAddress(tx.to)).toBe(ENTRY_POINT_07)
    expect(getAddress(tx.from)).toBe(DEVWALLET_SPONSOR)

    expect(receipt.status).toBe('0x1')
    expect(outcome).toMatchObject({
      success: true,
      paymaster: DEVWALLET_PAYMASTER,
    })
    expect(outcome!.actualGasCost).toBeGreaterThan(0n)
  })

  test('signature recovers to sender', async () => {
    const { signature, userOpHash } = await run([{ to: X, value: 1n }])
    expect(
      await recoverMessageAddress({
        message: { raw: userOpHash },
        signature,
      }),
    ).toBe(account)
  })

  test('reverting op: outer tx succeeds, outcome says failure', async () => {
    await node.setCode(REVERTER, '0x5f5ffd')
    const xBefore = await node.getBalance(X)

    const { receipt, outcome } = await run([
      { to: X, value: 1n },
      { to: REVERTER },
    ])

    expect(receipt.status).toBe('0x1')
    expect(outcome).toMatchObject({
      success: false,
      paymaster: DEVWALLET_PAYMASTER,
    })
    expect(outcome!.actualGasCost).toBeGreaterThan(0n)
    // The batch is atomic, so the first call is rolled back too.
    expect(await node.getBalance(X)).toBe(xBefore)
  })

  test('the nonce advances with each op', async () => {
    const calls = [{ to: X, value: 1n }]
    const first = await run(calls)
    expect(first.op.nonce).toBe(0n)
    const second = await run(calls)
    expect(second.op.nonce).toBe(1n)
    expect(second.outcome?.success).toBe(true)
  })

  test('buildUserOp fills the fixed and fee fields', async () => {
    const calls = [{ to: X, value: 1n }]
    const op = await buildUserOp(node, { sender: account, calls })
    const callData = encodeKernelBatch(calls)

    const estimate = hexToBigInt(
      await node.request<Hex>('eth_estimateGas', [
        { from: account, to: account, data: callData },
      ]),
    )
    const latest = await node.request<{ baseFeePerGas: Hex }>(
      'eth_getBlockByNumber',
      ['latest', false],
    )

    expect(op).toEqual({
      sender: account,
      nonce: 0n,
      callData,
      callGasLimit: (estimate * 12n) / 10n + 50_000n,
      verificationGasLimit: 500_000n,
      preVerificationGas: 60_000n,
      paymaster: DEVWALLET_PAYMASTER,
      paymasterVerificationGasLimit: 100_000n,
      paymasterPostOpGasLimit: 0n,
      paymasterData: '0x',
      maxPriorityFeePerGas: op.maxPriorityFeePerGas,
      maxFeePerGas:
        hexToBigInt(latest.baseFeePerGas) * 2n + op.maxPriorityFeePerGas,
      signature: '0x',
    })
    expect(op.maxPriorityFeePerGas).toBeGreaterThan(0n)
  })

  test('buildUserOp uses 1M call gas when the batch cannot be estimated', async () => {
    await node.setCode(REVERTER, '0x5f5ffd')
    const op = await buildUserOp(node, {
      sender: account,
      calls: [{ to: REVERTER }],
    })
    expect(op.callGasLimit).toBe(1_000_000n)
  })

  test('an account sponsor with only the gas reserve can submit', async () => {
    // The DevWallet sponsor funds the deposit, so the account pays no top-up.
    await prepareSponsor(node, { kind: 'devwallet' })
    await node.setBalance(FRESH, parseEther('0.1'))

    const { hash, outcome } = await run([{ to: X, value: 1n }], {
      kind: 'account',
      address: FRESH,
    })

    const tx = await node.request<{ from: Address }>(
      'eth_getTransactionByHash',
      [hash],
    )
    expect(getAddress(tx.from)).toBe(FRESH)
    expect(outcome?.success).toBe(true)
  })

  test('submitUserOp refuses an op the EntryPoint rejects', async () => {
    const op = await buildUserOp(node, {
      sender: account,
      calls: [{ to: X, value: 1n }],
    })
    const blockBefore = await node.blockNumber()
    // Unsigned, so account validation fails.
    await expect(
      submitUserOp(node, { op, bundler: DEV_ACCOUNTS[0] }),
    ).rejects.toThrow(/EntryPoint rejected the user operation: AA23/)
    expect(await node.blockNumber()).toBe(blockBefore)
  })

  test('getUserOpOutcome is null while the transaction is unknown', async () => {
    const unknown: Hex = `0x${'11'.repeat(32)}`
    expect(await getUserOpOutcome(node, unknown, unknown)).toBeNull()
  })

  test('getUserOpOutcome throws when the mined transaction lacks the op', async () => {
    const plan = await prepareSponsor(node, { kind: 'devwallet' })
    if (!plan.ok) throw new Error(plan.reason)
    const op = await buildUserOp(node, {
      sender: account,
      calls: [{ to: X, value: 1n }],
    })
    const { userOpHash } = await signUserOp(node, op, await node.chainId())
    // Unsigned, so handleOps reverts. Sent directly with explicit gas, as
    // `submitUserOp` would refuse it.
    const hash = await node.request<Hex>('eth_sendTransaction', [
      {
        from: plan.sender,
        to: ENTRY_POINT_07,
        data: encodeFunctionData({
          abi: entryPoint07Abi,
          functionName: 'handleOps',
          args: [[toPackedUserOperation(op)], plan.sender],
        }),
        gas: numberToHex(2_000_000n),
      },
    ])
    expect((await waitForReceipt(node, hash)).status).toBe('0x0')
    await expect(getUserOpOutcome(node, hash, userOpHash)).rejects.toThrow(
      /UserOperationEvent/,
    )
  })
})
