import { type Address, type Hex, isAddress, isHex } from 'viem'

import { isQuantity } from './eip5792'
import { INVALID_PARAMS, WalletRpcError } from './errors'
import { classifyCode } from './kernel'
import {
  type ReconcileResult,
  atomicStatus,
  defaultMode,
  reconcileAccounts,
} from './modes'
import type { Node } from './node'
import type { AaStatus } from './setup'
import { type AccountMode, type Call, type OnchainKind, toCall } from './types'

/**
 * Whether the node was reset (or restarted) since `prev` was seen: its block
 * number went down. A reset that is mined past `prev` again goes unnoticed.
 */
export function detectReset(
  prev: bigint | undefined,
  current: bigint,
): boolean {
  return prev !== undefined && current < prev
}

/**
 * An account's mode: the one the user stored, otherwise the default for its
 * on-chain state. Only accounts the node holds a key for can sign.
 */
export function resolveAccount(args: {
  address: Address
  impersonated: boolean
  stored?: AccountMode
  onchain: OnchainKind
}): { mode: AccountMode; canSign: boolean } {
  const { impersonated, stored, onchain } = args
  return {
    mode: stored ?? defaultMode({ impersonated, onchain }),
    canSign: !impersonated,
  }
}

/**
 * Whether a send must first upgrade the account to Kernel: only a
 * `wallet_sendCalls` from a plain-upgradable EOA, and only while the AA
 * contracts are installed.
 */
export function upgradesBeforeSend(args: {
  method: string
  mode: AccountMode
  onchain: OnchainKind
  aaReady: boolean
}): boolean {
  return (
    args.method === 'wallet_sendCalls' &&
    args.mode === 'plain-upgradable' &&
    atomicStatus(args.mode, args.onchain) === 'ready' &&
    args.aaReady
  )
}

function invalid(message: string): WalletRpcError {
  return new WalletRpcError(INVALID_PARAMS, message)
}

/**
 * The call an `eth_sendTransaction` makes: its `to`, `value` and `data` (or
 * `input`). A missing or null `to` is a deployment.
 *
 * @throws WalletRpcError `-32602` for malformed fields.
 */
export function sendTransactionCall(tx: unknown): Call {
  if (typeof tx !== 'object' || tx === null || Array.isArray(tx)) {
    throw invalid('Expected a transaction object')
  }
  const { to, value, data, input } = tx as Record<string, unknown>
  const payload = data ?? input
  if (
    to !== undefined &&
    to !== null &&
    !(typeof to === 'string' && isAddress(to, { strict: false }))
  ) {
    throw invalid('`to` must be an address')
  }
  if (value !== undefined && !isQuantity(value)) {
    throw invalid('`value` must be a hex quantity')
  }
  if (payload !== undefined && !(typeof payload === 'string' && isHex(payload)))
    throw invalid('`data` must be hex')
  return toCall({
    ...(typeof to === 'string' && { to: to as Address }),
    ...(value !== undefined && { value }),
    ...(payload !== undefined && { data: payload as Hex }),
  })
}

export type NetworkAccount = {
  address: Address
  impersonated: boolean
  /** The mode the user chose, if any. */
  stored?: AccountMode
}

export type NetworkState = {
  blockNumber: bigint
  /** The block number went down since `lastBlock`. */
  reset: boolean
  aa: AaStatus
  accounts: (ReconcileResult & { canSign: boolean })[]
}

/**
 * Makes the node match the wallet: reads the block number (to spot a reset),
 * resolves each account's mode from its stored one or its on-chain state, then
 * installs the AA contracts and reconciles every account. Defaults are not
 * stored, so an impersonated account keeps following its real code.
 *
 * @throws The node's errors (one failing account fails the whole call).
 */
export async function reconcileNetwork(
  node: Node,
  args: { lastBlock: bigint | undefined; accounts: readonly NetworkAccount[] },
): Promise<NetworkState> {
  const blockNumber = await node.blockNumber()
  const resolved = await Promise.all(
    args.accounts.map(async (account) => ({
      address: account.address,
      ...resolveAccount({
        ...account,
        onchain: classifyCode(await node.getCode(account.address)),
      }),
    })),
  )
  const { aa, accounts } = await reconcileAccounts(
    node,
    resolved.map(({ address, mode }) => ({ address, mode })),
  )
  return {
    blockNumber,
    reset: detectReset(args.lastBlock, blockNumber),
    aa,
    accounts: accounts.map((result, i) => ({
      ...result,
      canSign: resolved[i]?.canSign ?? false,
    })),
  }
}
