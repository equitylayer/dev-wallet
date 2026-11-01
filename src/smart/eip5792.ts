import {
  type Address,
  type Hash,
  type Hex,
  type RpcTransactionReceipt,
  bytesToHex,
  hexToNumber,
  isAddress,
  isHex,
  numberToHex,
} from 'viem'

import type { BatchRecord, BatchRecords } from './batch-records'
import { WalletRpcError } from './errors'
import type { Node } from './node'
import { type AtomicStatus, type Call, type RpcCall, toCall } from './types'
import { getUserOpOutcome } from './userop'

export type { BatchRecord } from './batch-records'

const INVALID_PARAMS = -32602
const UNAUTHORIZED = 4100
const UNSUPPORTED_CAPABILITY = 5700
const UNSUPPORTED_CHAIN_ID = 5710
const DUPLICATE_ID = 5720

const VERSION = '2.0.0'

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

  if (version !== VERSION) {
    throw invalidParams(`\`version\` must be "${VERSION}"`)
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
    if (!known) {
      throw new WalletRpcError(
        UNAUTHORIZED,
        `The account ${from} is not one of the wallet's accounts`,
      )
    }
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

// -- wallet_getCallsStatus ----------------------------------------------------

type CallsReceipt = {
  logs: { address: Address; data: Hex; topics: Hex[] }[]
  status: '0x1' | '0x0'
  blockHash: Hex
  blockNumber: Hex
  gasUsed: Hex
  transactionHash: Hash
}

export type CallsStatus = {
  version: '2.0.0'
  id: string
  chainId: Hex
  /** 100 pending, 200 confirmed, 500 reverted, 600 partially reverted. */
  status: 100 | 200 | 400 | 500 | 600
  atomic: boolean
  receipts?: CallsReceipt[]
}

const PENDING = 100
const CONFIRMED = 200
const REVERTED = 500
const PARTIALLY_REVERTED = 600

function toCallsReceipt(
  receipt: RpcTransactionReceipt,
  status: CallsReceipt['status'] = receipt.status === '0x1' ? '0x1' : '0x0',
): CallsReceipt {
  return {
    logs: receipt.logs.map(({ address, data, topics }) => ({
      address,
      data,
      topics: [...topics],
    })),
    status,
    blockHash: receipt.blockHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    transactionHash: receipt.transactionHash,
  }
}

/**
 * What a mined `handleOps` receipt means for the batch. Its own status says
 * nothing about the user operation, so the operation's event decides. A
 * transaction mined without that event did not execute the operation: that is
 * a failure, and the receipt keeps its own status. `null` if the transaction
 * has vanished since (a reorg), which makes the batch pending again.
 */
async function userOpResult(
  node: Node,
  record: BatchRecord,
  receipt: RpcTransactionReceipt,
): Promise<{ status: 200 | 500; receipt: CallsReceipt } | null> {
  try {
    const outcome = await getUserOpOutcome(
      node,
      receipt.transactionHash,
      record.userOpHash as Hex,
    )
    if (!outcome) return null
    return {
      status: outcome.success ? CONFIRMED : REVERTED,
      receipt: toCallsReceipt(receipt, outcome.success ? '0x1' : '0x0'),
    }
  } catch {
    return { status: REVERTED, receipt: toCallsReceipt(receipt) }
  }
}

/**
 * Reads the batch's transactions and maps them to an EIP-5792 status. While
 * any is unmined the status is `100`, with no receipts.
 */
export async function getCallsStatus(
  node: Node,
  record: BatchRecord,
): Promise<CallsStatus> {
  const base = {
    version: VERSION,
    id: record.id,
    chainId: numberToHex(record.chainId),
    atomic: record.path !== 'sequential',
  } as const
  const pending = { ...base, status: PENDING } as const

  const raw = await Promise.all(
    record.transactionHashes.map((hash) =>
      node.request<RpcTransactionReceipt | null>('eth_getTransactionReceipt', [
        hash,
      ]),
    ),
  )
  const mined = raw.filter((r): r is RpcTransactionReceipt => r !== null)
  if (mined.length < raw.length) return pending

  if (record.path === 'userop') {
    const result = await userOpResult(
      node,
      record,
      mined[0] as RpcTransactionReceipt,
    )
    if (!result) return pending
    return { ...base, status: result.status, receipts: [result.receipt] }
  }

  const receipts = mined.map((r) => toCallsReceipt(r))
  const succeeded = receipts.filter((r) => r.status === '0x1').length
  const status =
    succeeded === receipts.length
      ? CONFIRMED
      : succeeded === 0
        ? REVERTED
        : PARTIALLY_REVERTED
  return { ...base, status, receipts }
}
