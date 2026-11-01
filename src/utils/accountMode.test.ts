import { describe, expect, test } from 'bun:test'
import type { Address } from 'viem'

import type { AccountMode, OnchainKind } from '~/smart/types'

import {
  aaConflictWarning,
  clearsDelegation,
  modeChangeError,
  modeLabel,
  primaryModeAction,
} from './accountMode'

const MODES: AccountMode[] = ['smart', 'plain-upgradable', 'plain-never']
const TARGET: Address = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
const ENTRY_POINT: Address = '0x0000000071727De22E5E9d8BAf0edAc6f37da032'
const KERNEL: Address = '0xd6CEDDe84be40893d153Be9d467CD6aD37875b28'

const eoa: OnchainKind = { kind: 'eoa' }
const kernel: OnchainKind = { kind: 'kernel' }
const delegated: OnchainKind = { kind: 'delegated', target: TARGET }
const contract: OnchainKind = { kind: 'contract' }

describe('modeLabel', () => {
  test('a smart account delegated to Kernel', () => {
    expect(modeLabel('smart', kernel)).toBe('Smart · Kernel v3.3')
  })

  test('the plain modes of an EOA', () => {
    expect(modeLabel('plain-upgradable', eoa)).toBe('Plain (upgradable)')
    expect(modeLabel('plain-never', eoa)).toBe('Plain')
  })

  test('a smart account the node has not delegated', () => {
    expect(modeLabel('smart', eoa)).toBe('Smart · not delegated')
  })

  test('a delegation to anything but Kernel, whatever the mode', () => {
    for (const mode of MODES) {
      expect(modeLabel(mode, delegated)).toBe(
        `Delegated to ${TARGET} (not Kernel)`,
      )
    }
  })

  test('contract code, whatever the mode', () => {
    for (const mode of MODES) expect(modeLabel(mode, contract)).toBe('Contract')
  })

  test('Kernel code is what the account is, whatever the mode', () => {
    // A plain account keeps its Kernel code only until the next reconcile.
    for (const mode of MODES) {
      expect(modeLabel(mode, kernel)).toBe('Smart · Kernel v3.3')
    }
  })
})

describe('primaryModeAction', () => {
  test('a plain EOA can switch to smart', () => {
    expect(primaryModeAction('plain-upgradable', eoa)).toBe('smart')
    expect(primaryModeAction('plain-never', eoa)).toBe('smart')
  })

  test('a foreign delegation can switch to Kernel', () => {
    for (const mode of MODES) {
      expect(primaryModeAction(mode, delegated)).toBe('switch-to-kernel')
    }
  })

  test('a Kernel can be revoked', () => {
    for (const mode of MODES) expect(primaryModeAction(mode, kernel)).toBe('revoke')
  })

  test('nothing for contract code or a smart account still waiting', () => {
    for (const mode of MODES) expect(primaryModeAction(mode, contract)).toBeNull()
    expect(primaryModeAction('smart', eoa)).toBeNull()
  })
})

describe('clearsDelegation', () => {
  test('revoking clears any delegation', () => {
    expect(clearsDelegation('revoke', kernel)).toBe(true)
    expect(clearsDelegation('revoke', delegated)).toBe(true)
    expect(clearsDelegation('revoke', eoa)).toBe(false)
    expect(clearsDelegation('revoke', contract)).toBe(false)
  })

  test('a plain mode clears a Kernel, and leaves other code alone', () => {
    for (const action of ['plain-upgradable', 'plain-never'] as const) {
      expect(clearsDelegation(action, kernel)).toBe(true)
      expect(clearsDelegation(action, delegated)).toBe(false)
      expect(clearsDelegation(action, eoa)).toBe(false)
    }
  })

  test('switching to Kernel never clears', () => {
    for (const onchain of [eoa, kernel, delegated, contract]) {
      expect(clearsDelegation('smart', onchain)).toBe(false)
      expect(clearsDelegation('switch-to-kernel', onchain)).toBe(false)
    }
  })
})

describe('modeChangeError', () => {
  test('null when the account ends up as asked', () => {
    expect(modeChangeError('smart', { mode: 'smart', onchain: kernel })).toBeNull()
    expect(
      modeChangeError('switch-to-kernel', { mode: 'smart', onchain: kernel }),
    ).toBeNull()
    expect(
      modeChangeError('revoke', { mode: 'plain-upgradable', onchain: eoa }),
    ).toBeNull()
    expect(
      modeChangeError('plain-never', { mode: 'plain-never', onchain: eoa }),
    ).toBeNull()
    // A plain mode leaves a foreign delegation alone.
    expect(
      modeChangeError('plain-upgradable', {
        mode: 'plain-upgradable',
        onchain: delegated,
      }),
    ).toBeNull()
  })

  test('a smart account that was not delegated', () => {
    expect(modeChangeError('smart', { mode: 'smart', onchain: eoa })).toBe(
      "Couldn't switch to smart: the account is Smart · not delegated.",
    )
    expect(
      modeChangeError('switch-to-kernel', { mode: 'smart', onchain: delegated }),
    ).toBe(
      `Couldn't switch to Kernel: the account is Delegated to ${TARGET} (not Kernel).`,
    )
  })

  test('a revoke that left code behind', () => {
    expect(
      modeChangeError('revoke', { mode: 'plain-upgradable', onchain: kernel }),
    ).toBe(
      "Couldn't revoke the delegation: the account is Smart · Kernel v3.3.",
    )
  })

  test('a plain mode that kept its Kernel, or a mode that was not stored', () => {
    expect(
      modeChangeError('plain-never', { mode: 'plain-never', onchain: kernel }),
    ).toBe("Couldn't switch to Plain: the account is Smart · Kernel v3.3.")
    expect(
      modeChangeError('plain-upgradable', { mode: 'smart', onchain: eoa }),
    ).toBe(
      "Couldn't switch to Plain (upgradable): the account is Smart · not delegated.",
    )
  })
})

describe('aaConflictWarning', () => {
  test('names every address with unknown code', () => {
    expect(aaConflictWarning([ENTRY_POINT])).toBe(
      `Smart accounts are off on this network: unknown code at ${ENTRY_POINT}. DevWallet won't overwrite it.`,
    )
    expect(aaConflictWarning([ENTRY_POINT, KERNEL])).toBe(
      `Smart accounts are off on this network: unknown code at ${ENTRY_POINT}, ${KERNEL}. DevWallet won't overwrite it.`,
    )
  })
})
