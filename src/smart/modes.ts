import type { Address } from 'viem'

import { KERNEL_V3_3 } from './constants'
import { classifyCode, setDelegation } from './kernel'
import type { Node } from './node'
import { type AaStatus, ensureAaContracts } from './setup'
import type { AccountMode, AtomicStatus, OnchainKind } from './types'

export type ReconcileResult = {
  address: Address
  mode: AccountMode
  /** The account's on-chain state after any change. */
  onchain: OnchainKind
  changed: boolean
}

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

/**
 * Makes the account's on-chain code match its mode: a smart EOA is delegated
 * to Kernel, and a plain account that is a Kernel is cleared. Anything else
 * (foreign delegations, contracts) is left alone. Needs the AA contracts to be
 * installed already; see `reconcileAccounts`.
 */
export async function reconcileAccount(
  node: Node,
  a: { address: Address; mode: AccountMode },
): Promise<ReconcileResult> {
  const { address, mode } = a
  const onchain = classifyCode(await node.getCode(address))

  if (mode === 'smart' && onchain.kind === 'eoa') {
    await setDelegation(node, address, KERNEL_V3_3)
    return { address, mode, onchain: { kind: 'kernel' }, changed: true }
  }
  if (mode !== 'smart' && onchain.kind === 'kernel') {
    await setDelegation(node, address, null)
    return { address, mode, onchain: { kind: 'eoa' }, changed: true }
  }
  return { address, mode, onchain, changed: false }
}

/**
 * Installs the AA contracts, then reconciles every account. If the contracts
 * can't be installed (an address holds unknown code), accounts are only
 * classified, so nothing is delegated to a Kernel that isn't there.
 */
export async function reconcileAccounts(
  node: Node,
  accounts: { address: Address; mode: AccountMode }[],
): Promise<{ aa: AaStatus; accounts: ReconcileResult[] }> {
  const aa = await ensureAaContracts(node)
  if (!aa.ok) {
    return {
      aa,
      accounts: await Promise.all(
        accounts.map(async ({ address, mode }) => ({
          address,
          mode,
          onchain: classifyCode(await node.getCode(address)),
          changed: false,
        })),
      ),
    }
  }
  return {
    aa,
    accounts: await Promise.all(accounts.map((a) => reconcileAccount(node, a))),
  }
}
