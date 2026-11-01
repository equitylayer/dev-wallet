// How the wallet UI reads and words an account's mode: its label, which
// change to offer, and whether a change took. Pure, so it is unit-tested;
// `useAccountMode` and the screens only render it.
import type { Address } from 'viem'

import type { AccountModeAction } from '~/smart/resolve'
import type { AccountMode, OnchainKind } from '~/smart/types'

export type { AccountModeAction }

/** What an account is: its mode, read against the code it has on chain. */
export function modeLabel(mode: AccountMode, onchain: OnchainKind): string {
  switch (onchain.kind) {
    // The code is what counts: a plain account keeps a Kernel only until
    // the next reconcile clears it.
    case 'kernel':
      return 'Smart · Kernel v3.3'
    case 'delegated':
      return `Delegated to ${onchain.target} (not Kernel)`
    case 'contract':
      return 'Contract'
    case 'eoa':
      switch (mode) {
        case 'smart':
          return 'Smart · not delegated'
        case 'plain-upgradable':
          return 'Plain (upgradable)'
        case 'plain-never':
          return 'Plain'
      }
  }
}

/** The name of each change, as its button reads. */
export const actionLabels: Record<AccountModeAction, string> = {
  smart: 'Switch to smart',
  'switch-to-kernel': 'Switch to Kernel',
  revoke: 'Revoke delegation',
  'plain-upgradable': 'Plain (upgradable)',
  'plain-never': 'Plain',
}

/**
 * The change the account screen leads with: a plain EOA switches to smart, a
 * foreign delegation to Kernel, and a Kernel can be revoked. Nothing for
 * contract code (DevWallet never touches it) or for a smart account the node
 * hasn't delegated yet.
 */
export function primaryModeAction(
  mode: AccountMode,
  onchain: OnchainKind,
): 'smart' | 'switch-to-kernel' | 'revoke' | null {
  switch (onchain.kind) {
    case 'kernel':
      return 'revoke'
    case 'delegated':
      return 'switch-to-kernel'
    case 'contract':
      return null
    case 'eoa':
      return mode === 'smart' ? null : 'smart'
  }
}

/**
 * Whether the change clears the account's delegation, so it asks first:
 * revoking clears any delegation, and a plain mode clears a Kernel.
 */
export function clearsDelegation(
  action: AccountModeAction,
  onchain: OnchainKind,
): boolean {
  if (action === 'revoke') {
    return onchain.kind === 'kernel' || onchain.kind === 'delegated'
  }
  if (action === 'plain-upgradable' || action === 'plain-never') {
    return onchain.kind === 'kernel'
  }
  return false
}

const failures: Record<AccountModeAction, string> = {
  smart: "Couldn't switch to smart",
  'switch-to-kernel': "Couldn't switch to Kernel",
  revoke: "Couldn't revoke the delegation",
  'plain-upgradable': "Couldn't switch to Plain (upgradable)",
  'plain-never': "Couldn't switch to Plain",
}

/**
 * Why a mode change didn't take, read from the account as the background
 * reconciled it after the change; `null` when it did. A switch to smart or
 * Kernel ends delegated to Kernel, a revoke with no code, and a plain mode
 * stored and without a Kernel.
 */
export function modeChangeError(
  action: AccountModeAction,
  result: { mode: AccountMode; onchain: OnchainKind },
): string | null {
  const { mode, onchain } = result
  const took = (() => {
    switch (action) {
      case 'smart':
      case 'switch-to-kernel':
        return mode === 'smart' && onchain.kind === 'kernel'
      case 'revoke':
        return mode === 'plain-upgradable' && onchain.kind === 'eoa'
      case 'plain-upgradable':
      case 'plain-never':
        return mode === action && onchain.kind !== 'kernel'
    }
  })()
  if (took) return null
  return `${failures[action]}: the account is ${modeLabel(mode, onchain)}.`
}

/** Why smart accounts are off on a network: the AA addresses holding unknown code. */
export function aaConflictWarning(conflicts: readonly Address[]): string {
  return `Smart accounts are off on this network: unknown code at ${conflicts.join(', ')}. DevWallet won't overwrite it.`
}
