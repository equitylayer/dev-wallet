import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { type Address, getAddress } from 'viem'

import { KERNEL_V3_3 } from './constants'
import { delegationCode } from './kernel'
import {
  atomicStatus,
  defaultMode,
  reconcileAccount,
  reconcileAccounts,
} from './modes'
import { type Node, connectNode } from './node'
import { ensureAaContracts } from './setup'
import { DEV_ACCOUNTS, startAnvil } from './testing/anvil'
import type { AccountMode, OnchainKind } from './types'

const EOA: OnchainKind = { kind: 'eoa' }
const KERNEL: OnchainKind = { kind: 'kernel' }
const DELEGATED: OnchainKind = {
  kind: 'delegated',
  target: getAddress('0x1111111111111111111111111111111111111111'),
}
const CONTRACT: OnchainKind = { kind: 'contract' }

describe('defaultMode', () => {
  test.each([EOA, KERNEL, DELEGATED, CONTRACT])(
    'not impersonated is smart on %o',
    (onchain) => {
      expect(defaultMode({ impersonated: false, onchain })).toBe('smart')
    },
  )

  test('impersonated with kernel is smart', () => {
    expect(defaultMode({ impersonated: true, onchain: KERNEL })).toBe('smart')
  })

  test.each([EOA, DELEGATED, CONTRACT])(
    'impersonated with %o is plain-never',
    (onchain) => {
      expect(defaultMode({ impersonated: true, onchain })).toBe('plain-never')
    },
  )
})

describe('atomicStatus', () => {
  test('smart kernel is supported', () => {
    expect(atomicStatus('smart', KERNEL)).toBe('supported')
  })

  test('smart that is still an eoa or delegated elsewhere is unsupported', () => {
    expect(atomicStatus('smart', EOA)).toBe('unsupported')
    expect(atomicStatus('smart', DELEGATED)).toBe('unsupported')
  })

  test.each(['smart', 'plain-upgradable', 'plain-never'] as AccountMode[])(
    '%s on a contract is unsupported',
    (mode) => {
      expect(atomicStatus(mode, CONTRACT)).toBe('unsupported')
    },
  )

  test('plain-upgradable eoa is ready', () => {
    expect(atomicStatus('plain-upgradable', EOA)).toBe('ready')
  })

  test('plain-upgradable already delegated to kernel is supported', () => {
    expect(atomicStatus('plain-upgradable', KERNEL)).toBe('supported')
  })

  test('plain-upgradable delegated elsewhere is unsupported', () => {
    expect(atomicStatus('plain-upgradable', DELEGATED)).toBe('unsupported')
  })

  test.each([EOA, KERNEL, DELEGATED, CONTRACT])(
    'plain-never is unsupported on %o',
    (onchain) => {
      expect(atomicStatus('plain-never', onchain)).toBe('unsupported')
    },
  )
})

describe('on a real node', () => {
  // Each test gets its own fresh Anvil so code changes never leak between tests.
  let anvil: { rpcUrl: string; stop(): Promise<void> }
  let node: Node
  const account: Address = DEV_ACCOUNTS[0]
  const other: Address = DEV_ACCOUNTS[1]
  beforeEach(async () => {
    anvil = await startAnvil()
    node = await connectNode({ rpcUrl: anvil.rpcUrl })
  })
  afterEach(() => anvil.stop())

  describe('reconcileAccount', () => {
    beforeEach(async () => {
      expect((await ensureAaContracts(node)).ok).toBe(true)
    })

    test('delegates a smart eoa to kernel', async () => {
      const result = await reconcileAccount(node, {
        address: account,
        mode: 'smart',
      })
      expect(result).toEqual({
        address: account,
        mode: 'smart',
        onchain: KERNEL,
        changed: true,
      })
      expect(await node.getCode(account)).toBe(delegationCode(KERNEL_V3_3))
    })

    test('leaves a smart account that is already kernel alone', async () => {
      await reconcileAccount(node, { address: account, mode: 'smart' })
      const result = await reconcileAccount(node, {
        address: account,
        mode: 'smart',
      })
      expect(result).toEqual({
        address: account,
        mode: 'smart',
        onchain: KERNEL,
        changed: false,
      })
    })

    test.each(['plain-never', 'plain-upgradable'] as AccountMode[])(
      'clears a kernel delegation for %s',
      async (mode) => {
        await node.setCode(account, delegationCode(KERNEL_V3_3))
        const result = await reconcileAccount(node, { address: account, mode })
        expect(result).toEqual({
          address: account,
          mode,
          onchain: EOA,
          changed: true,
        })
        expect(await node.getCode(account)).toBe('0x')
      },
    )

    test('leaves a plain eoa alone', async () => {
      const result = await reconcileAccount(node, {
        address: account,
        mode: 'plain-never',
      })
      expect(result.changed).toBe(false)
      expect(result.onchain).toEqual(EOA)
      expect(await node.getCode(account)).toBe('0x')
    })

    test('leaves a smart account delegated elsewhere untouched', async () => {
      const code = delegationCode(DELEGATED.target)
      await node.setCode(account, code)
      const result = await reconcileAccount(node, {
        address: account,
        mode: 'smart',
      })
      expect(result.changed).toBe(false)
      expect(result.onchain.kind).toBe('delegated')
      expect(await node.getCode(account)).toBe(code)
    })

    test('leaves a smart contract account untouched', async () => {
      await node.setCode(account, '0x6000')
      const result = await reconcileAccount(node, {
        address: account,
        mode: 'smart',
      })
      expect(result).toEqual({
        address: account,
        mode: 'smart',
        onchain: CONTRACT,
        changed: false,
      })
      expect(await node.getCode(account)).toBe('0x6000')
    })
  })

  describe('reconcileAccounts', () => {
    test('installs the contracts and reconciles every account', async () => {
      await node.setCode(other, delegationCode(KERNEL_V3_3))
      const { aa, accounts } = await reconcileAccounts(node, [
        { address: account, mode: 'smart' },
        { address: other, mode: 'plain-never' },
      ])
      expect(aa.ok).toBe(true)
      expect(accounts).toEqual([
        { address: account, mode: 'smart', onchain: KERNEL, changed: true },
        { address: other, mode: 'plain-never', onchain: EOA, changed: true },
      ])
      expect(await node.getCode(account)).toBe(delegationCode(KERNEL_V3_3))
      expect(await node.getCode(other)).toBe('0x')
    })

    test('with an empty list still reports the aa status', async () => {
      const { aa, accounts } = await reconcileAccounts(node, [])
      expect(aa.ok).toBe(true)
      expect(accounts).toEqual([])
    })

    test('only classifies when the kernel slot holds unknown code', async () => {
      await node.setCode(KERNEL_V3_3, '0x6000')
      await node.setCode(other, delegationCode(KERNEL_V3_3))

      const { aa, accounts } = await reconcileAccounts(node, [
        { address: account, mode: 'smart' },
        { address: other, mode: 'plain-never' },
      ])

      expect(aa).toEqual({ ok: false, conflicts: [KERNEL_V3_3] })
      expect(accounts).toEqual([
        { address: account, mode: 'smart', onchain: EOA, changed: false },
        {
          address: other,
          mode: 'plain-never',
          onchain: KERNEL,
          changed: false,
        },
      ])
      // Nothing was delegated or cleared.
      expect(await node.getCode(account)).toBe('0x')
      expect(await node.getCode(other)).toBe(delegationCode(KERNEL_V3_3))
    })
  })
})
