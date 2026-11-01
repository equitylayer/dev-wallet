import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { type Address, getAddress } from 'viem'

import { KERNEL_V3_3 } from './constants'
import { WalletRpcError } from './errors'
import { delegationCode } from './kernel'
import { type Node, connectNode } from './node'
import {
  detectReset,
  isAccountModeAction,
  reconcileNetwork,
  resolveAccount,
  sendTransactionCall,
  upgradesBeforeSend,
} from './resolve'
import { isKnownKernelCode } from './setup'
import { DEV_ACCOUNTS, startAnvil } from './testing/anvil'
import type { AccountMode, OnchainKind } from './types'

const EOA: OnchainKind = { kind: 'eoa' }
const KERNEL: OnchainKind = { kind: 'kernel' }
const DELEGATED: OnchainKind = {
  kind: 'delegated',
  target: getAddress('0x1111111111111111111111111111111111111111'),
}
const CONTRACT: OnchainKind = { kind: 'contract' }
const address: Address = DEV_ACCOUNTS[1]

describe('isAccountModeAction', () => {
  test.each([
    'smart',
    'plain-upgradable',
    'plain-never',
    'switch-to-kernel',
    'revoke',
  ])('%p is an action', (action) => {
    expect(isAccountModeAction(action)).toBe(true)
  })

  test.each(['', 'Smart', 'delete', undefined, null, 1, {}])(
    '%p is not',
    (action) => {
      expect(isAccountModeAction(action)).toBe(false)
    },
  )
})

describe('detectReset', () => {
  test('nothing to compare against is not a reset', () => {
    expect(detectReset(undefined, 5n)).toBe(false)
  })

  test('a lower block number is a reset', () => {
    expect(detectReset(10n, 3n)).toBe(true)
  })

  test('the same or a higher block number is not a reset', () => {
    expect(detectReset(3n, 3n)).toBe(false)
    expect(detectReset(3n, 4n)).toBe(false)
  })
})

describe('resolveAccount', () => {
  test('a stored mode wins over the default', () => {
    expect(
      resolveAccount({
        address,
        impersonated: false,
        stored: 'plain-never',
        onchain: EOA,
      }).mode,
    ).toBe('plain-never')
    expect(
      resolveAccount({
        address,
        impersonated: true,
        stored: 'smart',
        onchain: EOA,
      }).mode,
    ).toBe('smart')
  })

  test.each([
    [false, EOA, 'smart'],
    [false, CONTRACT, 'smart'],
    [true, EOA, 'plain-never'],
    [true, KERNEL, 'smart'],
    [true, DELEGATED, 'plain-never'],
  ] as [boolean, OnchainKind, AccountMode][])(
    'without a stored mode, impersonated=%p on %o defaults to %s',
    (impersonated, onchain, mode) => {
      expect(resolveAccount({ address, impersonated, onchain }).mode).toBe(
        mode,
      )
    },
  )

  test('only an account the node holds a key for can sign', () => {
    expect(
      resolveAccount({ address, impersonated: false, onchain: EOA }).canSign,
    ).toBe(true)
    expect(
      resolveAccount({
        address,
        impersonated: true,
        stored: 'smart',
        onchain: KERNEL,
      }).canSign,
    ).toBe(false)
  })
})

describe('upgradesBeforeSend', () => {
  const base = {
    method: 'wallet_sendCalls',
    mode: 'plain-upgradable',
    onchain: EOA,
    aaReady: true,
  } as const

  test('a plain-upgradable eoa is upgraded for wallet_sendCalls', () => {
    expect(upgradesBeforeSend(base)).toBe(true)
  })

  test('eth_sendTransaction never upgrades', () => {
    expect(upgradesBeforeSend({ ...base, method: 'eth_sendTransaction' })).toBe(
      false,
    )
  })

  test('not without the AA contracts', () => {
    expect(upgradesBeforeSend({ ...base, aaReady: false })).toBe(false)
  })

  test('not when the account is anything but a plain-upgradable eoa', () => {
    expect(upgradesBeforeSend({ ...base, onchain: DELEGATED })).toBe(false)
    expect(upgradesBeforeSend({ ...base, onchain: CONTRACT })).toBe(false)
    expect(upgradesBeforeSend({ ...base, mode: 'smart' })).toBe(false)
    expect(upgradesBeforeSend({ ...base, mode: 'plain-never' })).toBe(false)
  })
})

describe('sendTransactionCall', () => {
  const to = getAddress('0x00000000000000000000000000000000000a0a0a')

  test('keeps to, value and data, and drops gas, nonce and fees', () => {
    expect(
      sendTransactionCall({
        from: address,
        to,
        value: '0x10',
        data: '0xabcd',
        gas: '0x5208',
        nonce: '0x1',
        maxFeePerGas: '0x1',
        maxPriorityFeePerGas: '0x1',
        type: '0x2',
      }),
    ).toEqual({ to, value: 16n, data: '0xabcd' })
  })

  test('reads `input` when there is no `data`', () => {
    expect(sendTransactionCall({ to, input: '0xab' })).toEqual({
      to,
      data: '0xab',
    })
  })

  test('a missing or null `to` is a deployment', () => {
    expect(sendTransactionCall({ data: '0x60' })).toEqual({ data: '0x60' })
    expect(sendTransactionCall({ to: null, data: '0x60' })).toEqual({
      data: '0x60',
    })
  })

  test.each([
    ['not an object', 'nope'],
    ['a bad to', { to: '0x1234' }],
    ['a bad value', { to, value: '10' }],
    ['an empty value', { to, value: '0x' }],
    ['bad data', { to, data: 'abcd' }],
  ])('%s is -32602', (_, tx) => {
    let error: unknown
    try {
      sendTransactionCall(tx)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(WalletRpcError)
    expect((error as WalletRpcError).code).toBe(-32602)
  })
})

describe('reconcileNetwork on a real node', () => {
  let anvil: { rpcUrl: string; stop(): Promise<void> }
  let node: Node
  beforeEach(async () => {
    anvil = await startAnvil()
    node = await connectNode({ rpcUrl: anvil.rpcUrl })
  })
  afterEach(() => anvil.stop())

  test('resolves modes, reconciles, and says who can sign', async () => {
    const stored = DEV_ACCOUNTS[2]
    const impersonated = getAddress('0x00000000000000000000000000000000000c0c0c')
    await node.setCode(stored, delegationCode(KERNEL_V3_3))

    const state = await reconcileNetwork(node, {
      lastBlock: undefined,
      accounts: [
        { address, impersonated: false },
        { address: stored, impersonated: false, stored: 'plain-never' },
        { address: impersonated, impersonated: true },
      ],
    })

    expect(state.reset).toBe(false)
    expect(state.aa.ok).toBe(true)
    expect(state.accounts).toEqual([
      { address, mode: 'smart', onchain: KERNEL, changed: true, canSign: true },
      {
        address: stored,
        mode: 'plain-never',
        onchain: EOA,
        changed: true,
        canSign: true,
      },
      {
        address: impersonated,
        mode: 'plain-never',
        onchain: EOA,
        changed: false,
        canSign: false,
      },
    ])
    expect(await node.getCode(address)).toBe(delegationCode(KERNEL_V3_3))
    expect(await node.getCode(stored)).toBe('0x')
    expect(await node.getCode(impersonated)).toBe('0x')
  })

  // Review Focus #1: a node reset wipes the contracts and the delegations, and
  // the next reconcile notices the reset and puts them back.
  test('after anvil_reset, the next reconcile detects it and restores Kernel and the delegation', async () => {
    const accounts = [{ address, impersonated: false }]
    await node.request('anvil_mine', ['0x5'])

    const before = await reconcileNetwork(node, {
      lastBlock: undefined,
      accounts,
    })
    expect(before.reset).toBe(false)
    expect(before.blockNumber).toBe(5n)
    expect(before.accounts[0]?.onchain).toEqual(KERNEL)
    expect(await node.getCode(address)).toBe(delegationCode(KERNEL_V3_3))

    await node.request('anvil_reset', [])
    expect(await node.getCode(address)).toBe('0x')
    expect(await node.getCode(KERNEL_V3_3)).toBe('0x')

    const after = await reconcileNetwork(node, {
      lastBlock: before.blockNumber,
      accounts,
    })
    expect(after.blockNumber).toBe(0n)
    expect(detectReset(before.blockNumber, after.blockNumber)).toBe(true)
    expect(after.reset).toBe(true)
    expect(after.aa.ok).toBe(true)
    expect(after.aa.ok && after.aa.installed).toContain(KERNEL_V3_3)
    expect(after.accounts).toEqual([
      { address, mode: 'smart', onchain: KERNEL, changed: true, canSign: true },
    ])
    expect(isKnownKernelCode(await node.getCode(KERNEL_V3_3))).toBe(true)
    expect(await node.getCode(address)).toBe(delegationCode(KERNEL_V3_3))

    // Nothing changed since, so the next reconcile neither resets nor writes.
    const again = await reconcileNetwork(node, {
      lastBlock: after.blockNumber,
      accounts,
    })
    expect(again.reset).toBe(false)
    expect(again.accounts[0]?.changed).toBe(false)
  })
})
