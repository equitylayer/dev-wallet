// How the approval screens and the batch review read a `SendPreview`: which
// actions to offer, and the words and amounts to show. Pure, so it is
// unit-tested; the screens only render it.
import { type Address, formatUnits } from 'viem'

import type { ExecutionPath } from '~/smart/execute'
import type { SendPreview } from '~/smart/preview'
import { type BatchQueue, type QueuedItem, cannotJoin } from '~/smart/queue'
import type { AccountMode, RpcCall } from '~/smart/types'

import { formatEth } from './formatEth'
import { quantity } from './transactionForm'

export type SendMethod = 'eth_sendTransaction' | 'wallet_sendCalls'

/**
 * Whether approving sends a predicted revert anyway ("Sign anyway", with
 * `force`). Not when the calls can't be sent at all (`error`), and not for a
 * plain account's `eth_sendTransaction`: the node gets that one as it is, and
 * `force` means nothing to it.
 */
export function signAnyway(
  method: SendMethod,
  preview: SendPreview | undefined,
): boolean {
  if (!preview || preview.error || preview.simulation.ok) return false
  return method === 'wallet_sendCalls' || preview.mode === 'smart'
}

export type SendActions = {
  /**
   * "Add to batch": offered; in its place but disabled until the preview
   * confirms the account's mode (`wait`); or hidden, where the background
   * would refuse it.
   */
  addToBatch: 'offer' | 'wait' | 'hidden'
  /** Why it is hidden, when a batch open for another account or network is why. */
  batchNote: string | null
  /** The forward action: "Add to batch" once a batch is open for the account. */
  primary: 'batch' | 'approve'
  /** "Approve" reads "Sign anyway" and sends with `force`. */
  signAnyway: boolean
}

/** The actions of a send's approval screen. */
export function sendActions(args: {
  method: SendMethod
  preview: SendPreview | undefined
  /** The preview is on its way. */
  loading?: boolean
  /** The account's mode as known before the preview, if it is. */
  mode?: AccountMode
  from: Address
  calls: readonly RpcCall[]
  /** The active network's, which the preview is for. */
  rpcUrl: string
  queue: BatchQueue | null
}): SendActions {
  const { preview, queue, rpcUrl } = args
  // The preview's mode is the background's; until then, the one known, or
  // smart, the only one that could batch.
  const mode = preview?.mode ?? args.mode ?? 'smart'
  const send = { rpcUrl, account: args.from, mode, calls: args.calls }
  // The background's own rule (a smart account, no deployment, the open batch
  // for this account and network), so a refusal is the exception.
  const refusal = cannotJoin(queue, send, rpcUrl)
  // No preview and none coming: the send can't be planned, nor batched.
  const addToBatch =
    refusal !== null || (!preview && !args.loading)
      ? 'hidden'
      : preview
        ? 'offer'
        : 'wait'
  return {
    addToBatch,
    // Only the open batch is in the way: say so.
    batchNote:
      refusal !== null && cannotJoin(null, send, rpcUrl) === null
        ? refusal
        : null,
    primary: addToBatch !== 'hidden' && queue !== null ? 'batch' : 'approve',
    signAnyway: signAnyway(args.method, preview),
  }
}

/**
 * Whether the node gets the send as it is: a plain account's
 * `eth_sendTransaction` (`smart-sends.ts`). Its gas, fees and nonce then
 * count; a smart account's path picks its own.
 */
export function passesThrough(
  method: SendMethod,
  preview: SendPreview | undefined,
): boolean {
  return (
    method === 'eth_sendTransaction' &&
    preview !== undefined &&
    preview.mode !== 'smart'
  )
}

function gasUsed(preview: SendPreview): bigint | null {
  const { simulation } = preview
  return simulation.ok && simulation.gasUsed !== null
    ? BigInt(simulation.gasUsed)
    : null
}

/**
 * What the send should cost, in wei. The preview's `gasUsed × maxFeePerGas`,
 * except that a send the node gets as it is pays the dApp's fee per gas, and
 * stops at its gas limit.
 */
export function estimatedCost(
  method: SendMethod,
  preview: SendPreview,
  tx: Record<string, unknown> | undefined,
): bigint | null {
  const estimate =
    preview.estimatedCostWei === null ? null : BigInt(preview.estimatedCostWei)
  if (!tx || !passesThrough(method, preview)) return estimate
  const used = gasUsed(preview)
  const limit = quantity(tx.gas)
  const fee = quantity(tx.maxFeePerGas) ?? quantity(tx.gasPrice)
  // The node's fee per gas, back out of the preview's estimate.
  const nodeFee = estimate !== null && used ? estimate / used : null
  const price = fee ?? nodeFee
  const gas =
    used === null ? limit : limit !== null && limit < used ? limit : used
  return price === null || gas === null ? null : gas * price
}

/**
 * A send that the node gets as it is, with a gas limit under what its
 * simulation used: it runs out of gas.
 */
export function gasShortfall(
  method: SendMethod,
  preview: SendPreview,
  tx: Record<string, unknown> | undefined,
): { limit: bigint; used: bigint } | null {
  if (!tx || !passesThrough(method, preview)) return null
  const used = gasUsed(preview)
  const limit = quantity(tx.gas)
  return used !== null && limit !== null && limit < used
    ? { limit, used }
    : null
}

/**
 * Whether the send upgrades the account to Kernel first: a plain-upgradable
 * account's `wallet_sendCalls`, previewed as the Kernel account it becomes
 * (only then does it plan a smart path).
 */
export function upgradesFirst(
  method: SendMethod,
  preview: SendPreview | undefined,
): boolean {
  return (
    method === 'wallet_sendCalls' &&
    preview?.mode === 'plain-upgradable' &&
    preview.atomicStatus === 'ready' &&
    (preview.path === 'userop' || preview.path === 'self-call')
  )
}

/**
 * The mode's name alone, for a narrow readout. `modeLabel` (`./accountMode`)
 * reads it against the account's code.
 */
export function modeName(mode: AccountMode): string {
  switch (mode) {
    case 'smart':
      return 'Smart'
    case 'plain-upgradable':
      return 'Plain (upgradable)'
    case 'plain-never':
      return 'Plain'
  }
}

export function pathLabel(path: ExecutionPath): {
  label: string
  description: string
} {
  switch (path) {
    case 'userop':
      return {
        label: 'User operation',
        description:
          'One user operation through the EntryPoint, submitted by the sponsor.',
      }
    case 'self-call':
      return {
        label: 'Self-call',
        description:
          'One transaction from the account to itself, running the calls as a Kernel batch.',
      }
    case 'sequential':
      return {
        label: 'One by one',
        description: 'One transaction per call, sent by the account.',
      }
    case 'deploy':
      return {
        label: 'Deployment',
        description: 'A contract deployment, sent by the account.',
      }
  }
}

const MINUS = '−'
// Below a millionth of an ETH, `formatEth` reads 0: show wei instead.
const WEI_BELOW = 10n ** 12n

function sign(value: bigint, signed: boolean): string {
  if (value < 0n) return MINUS
  return signed && value > 0n ? '+' : ''
}

const abs = (value: bigint) => (value < 0n ? -value : value)

/** Wei as ETH, the way balances read, or as wei when it's that small. */
export function ethAmount(
  wei: bigint,
  { signed = false }: { signed?: boolean } = {},
): { amount: string; unit: 'ETH' | 'wei' } {
  const size = abs(wei)
  if (size !== 0n && size < WEI_BELOW) {
    return {
      amount: `${sign(wei, signed)}${size.toLocaleString('en-US')}`,
      unit: 'wei',
    }
  }
  return { amount: `${sign(wei, signed)}${formatEth(size)}`, unit: 'ETH' }
}

/** A token amount change, signed, with every digit. */
export function tokenAmount(delta: bigint, decimals: number): string {
  const [whole = '0', fraction] = formatUnits(abs(delta), decimals).split('.')
  const grouped = BigInt(whole).toLocaleString('en-US')
  return `${sign(delta, true)}${fraction ? `${grouped}.${fraction}` : grouped}`
}

/**
 * Which queued request, and which of its calls, a call index of the whole
 * batch (`flattenQueue`) falls in.
 */
export function locateCall(
  items: readonly QueuedItem[],
  index: number | null,
): { itemIndex: number; callIndex: number } | null {
  if (index === null) return null
  let start = 0
  for (const [itemIndex, item] of items.entries()) {
    if (index < start + item.calls.length) {
      return { itemIndex, callIndex: index - start }
    }
    start += item.calls.length
  }
  return null
}
