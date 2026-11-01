// The call an `eth_sendTransaction` makes. Apart from `./resolve`, so the
// wallet UI can preview it without the reconcile code.
import { type Address, type Hex, isAddress, isHex } from 'viem'

import { isQuantity } from './eip5792'
import { INVALID_PARAMS, WalletRpcError } from './errors'
import { type AccountMode, type Call, toCall } from './types'

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

/**
 * Whether sending `tx` from an account in `mode` drops every field but `to`,
 * `value` and `data`: only a smart account's transaction with a `from`, which
 * goes through the execution core as one call. Without a string `from`, or
 * from any other account, the node gets the transaction whole.
 */
export function dropsExtras(
  tx: Record<string, unknown>,
  mode: AccountMode | undefined,
): boolean {
  return typeof tx.from === 'string' && mode === 'smart'
}

/**
 * What a smart account's transaction can't carry (R54): the core sends only
 * to, value and data, and dropping these would send something else than the
 * dApp asked for (no code set, no blobs). Its type, access list, gas, fees
 * and nonce it drops (`dropsExtras`).
 */
const SMART_PATH_REFUSES = [
  'authorizationList',
  'blobVersionedHashes',
  'maxFeePerBlobGas',
  'blobs',
] as const

/**
 * The first field of `tx` a smart account can't send (`SMART_PATH_REFUSES`),
 * or `undefined`. An absent, null or empty list carries nothing.
 */
export function refusedOnSmartPath(
  tx: Record<string, unknown>,
): (typeof SMART_PATH_REFUSES)[number] | undefined {
  return SMART_PATH_REFUSES.find((field) => {
    const value = tx[field]
    if (value === undefined || value === null) return false
    return !(Array.isArray(value) && value.length === 0)
  })
}

/**
 * Checks that a smart account can send `tx` (`refusedOnSmartPath`).
 *
 * @throws WalletRpcError `-32602` naming the first field it can't.
 */
export function assertSmartSendable(tx: Record<string, unknown>): void {
  const field = refusedOnSmartPath(tx)
  if (field === undefined) return
  throw invalid(
    `A smart account can't send \`${field}\`: it sends only to, value and data. Switch the account to Plain to send it.`,
  )
}

/**
 * `tx` sent from `address` when it names no account (`from` absent or null),
 * as `eth_accounts` would have the page pick; a string `from` is kept, `tx`
 * itself.
 *
 * @throws WalletRpcError `-32602` for a `from` that isn't a string, or a
 *   `tx` that isn't a transaction object.
 */
export function withFrom(tx: unknown, address: Address): Record<string, unknown> {
  if (typeof tx !== 'object' || tx === null || Array.isArray(tx)) {
    throw invalid('Expected a transaction object')
  }
  const { from } = tx as Record<string, unknown>
  if (typeof from === 'string') return tx as Record<string, unknown>
  if (from != null) throw invalid('`from` must be an address')
  return { ...tx, from: address }
}
