// An account's mode rules, pure and dependency-free: the background's
// reconcile (`./modes`) and the wallet UI share them.
import type { AccountMode, AtomicStatus, OnchainKind } from './types'

/**
 * The mode an account without a stored one gets. Accounts are smart by
 * default; an impersonated account keeps whatever code it already has, so it
 * is only smart when it is already a Kernel.
 */
export function defaultMode({
  impersonated,
  onchain,
}: { impersonated: boolean; onchain: OnchainKind }): AccountMode {
  if (!impersonated) return 'smart'
  return onchain.kind === 'kernel' ? 'smart' : 'plain-never'
}

/**
 * Whether an account can batch calls atomically. Compute it after reconcile:
 * a smart account that is still not a Kernel could not be delegated.
 */
export function atomicStatus(
  mode: AccountMode,
  onchain: OnchainKind,
): AtomicStatus {
  if (mode === 'plain-never') return 'unsupported'
  switch (onchain.kind) {
    case 'kernel':
      return 'supported'
    case 'eoa':
      return mode === 'plain-upgradable' ? 'ready' : 'unsupported'
    case 'delegated':
    case 'contract':
      return 'unsupported'
  }
}
