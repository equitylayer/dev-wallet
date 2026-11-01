import {
  type Address,
  type Hex,
  bytesToHex,
  hexToNumber,
  isAddress,
  isHex,
  numberToHex,
} from 'viem'

import type { BatchRecords } from './batch-records'
import { EIP5792_VERSION } from './calls-status'
import {
  INVALID_PARAMS,
  WalletRpcError,
  unauthorizedAccount,
} from './errors'
import { type AtomicStatus, type Call, type RpcCall, toCall } from './types'

const UNSUPPORTED_CAPABILITY = 5700
const UNSUPPORTED_CHAIN_ID = 5710
const DUPLICATE_ID = 5720

function invalidParams(message: string): WalletRpcError {
  return new WalletRpcError(INVALID_PARAMS, message)
}

/** A hex number with at least one digit: `0x0`, never `0x` or `10`. */
export function isQuantity(value: unknown): value is Hex {
  return typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value)
}

/**
 * Whether `value` is a plain JSON object. (Arrays and `null` are not.)
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// -- wallet_getCapabilities ---------------------------------------------------

export type Capabilities = Record<Hex, { atomic: { status: AtomicStatus } }>

/**
 * The wallet's capabilities for the chain, keyed by hex chain id (an explicit
 * `0x7a69` entry, which viem needs). It advertises nothing but `atomic`.
 */
export function getCapabilities({
  chainId,
  status,
  requestedChainIds,
}: {
  chainId: number
  status: AtomicStatus
  requestedChainIds?: Hex[]
}): Capabilities {
  const asked =
    requestedChainIds === undefined ||
    requestedChainIds.some(
      (id) => isQuantity(id) && hexToNumber(id) === chainId,
    )
  return asked ? { [numberToHex(chainId)]: { atomic: { status } } } : {}
}

// -- wallet_sendCalls ---------------------------------------------------------

export type ParsedSendCalls = {
  id: string
  from: Address
  calls: Call[]
  atomicRequired: boolean
}

/** We advertise no sendCalls capability, so only optional ones may be sent. */
function checkCapabilities(capabilities: unknown): void {
  if (capabilities === undefined) return
  if (!isRecord(capabilities)) {
    throw invalidParams('`capabilities` must be an object')
  }
  for (const [name, value] of Object.entries(capabilities)) {
    if (isRecord(value) && value.optional === true) continue
    throw new WalletRpcError(
      UNSUPPORTED_CAPABILITY,
      `The capability "${name}" is not supported`,
    )
  }
}

function parseCall(call: unknown, index: number): Call {
  if (!isRecord(call)) throw invalidParams(`calls[${index}] must be an object`)
  const { to, value, data, capabilities } = call
  if (
    to !== undefined &&
    !(typeof to === 'string' && isAddress(to, { strict: false }))
  ) {
    throw invalidParams(`calls[${index}].to must be an address`)
  }
  if (value !== undefined && !isQuantity(value)) {
    throw invalidParams(`calls[${index}].value must be a hex quantity`)
  }
  if (data !== undefined && !(typeof data === 'string' && isHex(data))) {
    throw invalidParams(`calls[${index}].data must be hex`)
  }
  checkCapabilities(capabilities)
  return toCall({ to, value, data } as RpcCall)
}

/**
 * Validates `wallet_sendCalls` params per EIP-5792 v2. `from` falls back to
 * the active account and comes back as the known account's own spelling; a
 * missing `id` is generated.
 *
 * @throws WalletRpcError `-32602` for malformed params (including no calls),
 * `5710` for another chain, `4100` for a `from` the wallet doesn't hold,
 * `5720` for a duplicate id, `5700` for a required capability.
 */
export function parseSendCalls(
  params: unknown,
  ctx: {
    chainId: number
    activeAccount: Address
    knownAccounts: readonly Address[]
    records: BatchRecords
  },
): ParsedSendCalls {
  const request = Array.isArray(params) ? params[0] : undefined
  if (!isRecord(request)) {
    throw invalidParams('Expected a single object of call parameters')
  }
  const { version, chainId, from, id, atomicRequired, calls, capabilities } =
    request

  if (version !== EIP5792_VERSION) {
    throw invalidParams(`\`version\` must be "${EIP5792_VERSION}"`)
  }
  if (!isQuantity(chainId)) {
    throw invalidParams('`chainId` must be a hex quantity')
  }
  if (hexToNumber(chainId) !== ctx.chainId) {
    throw new WalletRpcError(
      UNSUPPORTED_CHAIN_ID,
      `Chain ${chainId} is not supported: the wallet is on ${numberToHex(
        ctx.chainId,
      )}`,
    )
  }

  let sender = ctx.activeAccount
  if (from !== undefined) {
    if (typeof from !== 'string' || !isAddress(from, { strict: false })) {
      throw invalidParams('`from` must be an address')
    }
    const known = ctx.knownAccounts.find(
      (a) => a.toLowerCase() === from.toLowerCase(),
    )
    if (!known) throw unauthorizedAccount(from)
    sender = known
  }

  if (id !== undefined && (typeof id !== 'string' || id === '')) {
    throw invalidParams('`id` must be a non-empty string')
  }
  if (id !== undefined && ctx.records.get(id)) {
    throw new WalletRpcError(DUPLICATE_ID, `The id ${id} is already in use`)
  }

  if (atomicRequired !== undefined && typeof atomicRequired !== 'boolean') {
    throw invalidParams('`atomicRequired` must be a boolean')
  }
  checkCapabilities(capabilities)

  if (!Array.isArray(calls) || calls.length === 0) {
    throw invalidParams('`calls` must be a non-empty array')
  }

  return {
    id: id ?? bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
    from: sender,
    calls: calls.map(parseCall),
    atomicRequired: atomicRequired ?? false,
  }
}
