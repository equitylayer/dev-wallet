import type { Address } from 'viem'

import { KERNEL_V3_3 } from './constants'
import { classifyCode, setDelegation } from './kernel'
import type { Node } from './node'
import { type AaStatus, ensureAaContracts } from './setup'
import type { AccountMode, OnchainKind } from './types'

// The pure rules live apart, so the wallet UI can use them without the node
// setup (and the contracts' code) that reconciling needs.
export { atomicStatus, defaultMode } from './mode-rules'

export type ReconcileResult = {
  address: Address
  mode: AccountMode
  /** The account's on-chain state after any change. */
  onchain: OnchainKind
  changed: boolean
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
