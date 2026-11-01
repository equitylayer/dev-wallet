import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { type Address, getAddress, numberToHex } from 'viem'

import { DEVWALLET_SPONSOR } from './constants'
import { WalletRpcError } from './errors'
import type { ExecutionPlan } from './execute'
import { reconcileAccounts } from './modes'
import { type Node, connectNode } from './node'
import { previewCalls, toSendPreview } from './preview'
import { DEV_ACCOUNTS, startAnvil } from './testing/anvil'
import type { OnchainKind, RpcCall } from './types'

const KERNEL: OnchainKind = { kind: 'kernel' }
const EOA: OnchainKind = { kind: 'eoa' }

const roundTrip = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

describe('toSendPreview', () => {
  const plan: ExecutionPlan = {
    path: 'userop',
    payer: DEVWALLET_SPONSOR,
    sponsored: true,
    simulation: {
      ok: true,
      gasUsed: 21000n,
      balanceChanges: [{ token: 'native', delta: -5n }],
    },
  }

  test('costs gasUsed at maxFeePerGas, as decimal strings', () => {
    const preview = toSendPreview({
      mode: 'smart',
      onchain: KERNEL,
      plan,
      maxFeePerGas: 2n,
    })
    expect(preview).toStrictEqual({
      mode: 'smart',
      onchain: KERNEL,
      atomicStatus: 'supported',
      path: 'userop',
      payer: DEVWALLET_SPONSOR,
      sponsored: true,
      estimatedCostWei: '42000',
      simulation: {
        ok: true,
        gasUsed: '21000',
        balanceChanges: [{ token: 'native', delta: '-5' }],
      },
    })
    expect(roundTrip(preview)).toStrictEqual(preview)
  })

  test('an unknown gas figure has no cost', () => {
    const preview = toSendPreview({
      mode: 'plain-never',
      onchain: EOA,
      plan: {
        path: 'sequential',
        payer: DEV_ACCOUNTS[1],
        sponsored: false,
        simulation: { ok: true, gasUsed: null, balanceChanges: null },
      },
      maxFeePerGas: 2n,
    })
    expect(preview.estimatedCostWei).toBeNull()
    expect(preview.atomicStatus).toBe('unsupported')
    expect(preview.simulation).toStrictEqual({
      ok: true,
      gasUsed: null,
      balanceChanges: null,
    })
  })

  test('a failed simulation and a fallback reason come through', () => {
    const preview = toSendPreview({
      mode: 'smart',
      onchain: KERNEL,
      plan: {
        path: 'self-call',
        payer: DEV_ACCOUNTS[1],
        sponsored: false,
        fallbackReason: 'you pay',
        simulation: {
          ok: false,
          failedIndex: 1,
          revertData: '0xdeadbeef',
          message: 'Call 2 reverted: custom error 0xdeadbeef',
        },
      },
      maxFeePerGas: 2n,
    })
    expect(preview).toStrictEqual({
      mode: 'smart',
      onchain: KERNEL,
      atomicStatus: 'supported',
      path: 'self-call',
      payer: DEV_ACCOUNTS[1],
      sponsored: false,
      fallbackReason: 'you pay',
      estimatedCostWei: null,
      simulation: {
        ok: false,
        failedIndex: 1,
        revertData: '0xdeadbeef',
        message: 'Call 2 reverted: custom error 0xdeadbeef',
      },
    })
    expect(roundTrip(preview)).toStrictEqual(preview)
  })

  test('a thrown error becomes `error`, with no path', () => {
    const preview = toSendPreview({
      mode: 'smart',
      onchain: KERNEL,
      error: new WalletRpcError(3, 'reverted', '0xdead'),
      maxFeePerGas: 2n,
    })
    expect(preview).toStrictEqual({
      mode: 'smart',
      onchain: KERNEL,
      atomicStatus: 'supported',
      path: null,
      payer: null,
      sponsored: false,
      estimatedCostWei: null,
      simulation: {
        ok: false,
        failedIndex: null,
        revertData: '0xdead',
        message: 'reverted',
      },
      error: { code: 3, message: 'reverted', data: '0xdead' },
    })
    expect(roundTrip(preview)).toStrictEqual(preview)
  })

  test('a non-wallet error is -32603 and has no revert data', () => {
    const preview = toSendPreview({
      mode: 'smart',
      onchain: KERNEL,
      error: new Error('fetch failed'),
      maxFeePerGas: 2n,
    })
    expect(preview.path).toBeNull()
    expect(preview.error).toStrictEqual({
      code: -32603,
      message: 'fetch failed',
    })
    expect(preview.simulation).toStrictEqual({
      ok: false,
      failedIndex: null,
      revertData: null,
      message: 'fetch failed',
    })
  })
})

describe('previewCalls on a real node', () => {
  const account: Address = DEV_ACCOUNTS[1]
  const plain: Address = DEV_ACCOUNTS[2]
  const X = getAddress('0x00000000000000000000000000000000000a0a0a')
  const R = getAddress('0x00000000000000000000000000000000000dead0')
  // Runtime code that reverts with the 4 bytes `0xdeadbeef`.
  const REVERTER_CODE = '0x63deadbeef5f526004601cfd'
  const transfer: RpcCall = { to: X, value: numberToHex(1n) }

  let anvil: { rpcUrl: string; stop(): Promise<void> }
  let node: Node
  let deps: { node: Node; chainId: number; sponsor: { kind: 'devwallet' } }
  beforeAll(async () => {
    anvil = await startAnvil()
    node = await connectNode({ rpcUrl: anvil.rpcUrl })
    await node.setCode(R, REVERTER_CODE)
    await reconcileAccounts(node, [
      { address: account, mode: 'smart' },
      { address: plain, mode: 'plain-upgradable' },
    ])
    deps = { node, chainId: await node.chainId(), sponsor: { kind: 'devwallet' } }
  })
  afterAll(() => anvil.stop())

  const smart = {
    address: account,
    mode: 'smart',
    onchain: KERNEL,
    canSign: true,
  } as const
  const upgradable = {
    address: plain,
    mode: 'plain-upgradable',
    onchain: EOA,
    canSign: true,
  } as const

  test('a smart account batch is a sponsored user op, and nothing is sent', async () => {
    const block = await node.blockNumber()
    const preview = await previewCalls(deps, {
      account: smart,
      calls: [transfer, transfer],
      atomicRequired: true,
      asSmart: false,
    })
    expect(preview).toMatchObject({
      mode: 'smart',
      atomicStatus: 'supported',
      path: 'userop',
      payer: DEVWALLET_SPONSOR,
      sponsored: true,
      simulation: { ok: true },
    })
    expect(preview.error).toBeUndefined()
    expect(BigInt(preview.estimatedCostWei ?? '0')).toBeGreaterThan(0n)
    expect(await node.blockNumber()).toBe(block)
    expect(roundTrip(preview)).toStrictEqual(preview)
  })

  test('a predicted revert shows what "Sign anyway" would do', async () => {
    const preview = await previewCalls(deps, {
      account: smart,
      calls: [transfer, { to: R }],
      atomicRequired: true,
      asSmart: false,
    })
    expect(preview.error).toBeUndefined()
    expect(preview).toMatchObject({
      path: 'self-call',
      payer: account,
      sponsored: false,
      simulation: { ok: false, failedIndex: 1, revertData: '0xdeadbeef' },
    })
    expect(preview.fallbackReason).toBeString()
  })

  test('a plain-upgradable account about to be upgraded previews as smart', async () => {
    const preview = await previewCalls(deps, {
      account: upgradable,
      calls: [transfer, transfer],
      atomicRequired: true,
      asSmart: true,
    })
    expect(preview).toMatchObject({
      mode: 'plain-upgradable',
      onchain: EOA,
      atomicStatus: 'ready',
      path: 'userop',
      sponsored: true,
    })
  })

  test('a plain-upgradable account that is not upgraded sends one by one', async () => {
    const preview = await previewCalls(deps, {
      account: upgradable,
      calls: [transfer],
      atomicRequired: false,
      asSmart: false,
    })
    expect(preview).toMatchObject({
      mode: 'plain-upgradable',
      path: 'sequential',
      payer: plain,
      sponsored: false,
    })
  })

  test('a batch that cannot be atomic is an error preview, not a throw', async () => {
    const preview = await previewCalls(deps, {
      account: { ...upgradable, mode: 'plain-never' },
      calls: [transfer, transfer],
      atomicRequired: true,
      asSmart: false,
    })
    expect(preview.path).toBeNull()
    expect(preview.atomicStatus).toBe('unsupported')
    expect(preview.error?.code).toBe(5760)
  })
})
