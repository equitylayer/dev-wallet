// How the approval screens and the batch review read a `SendPreview`: which
// actions to offer, and the words and amounts to show. Pure, so it is
// unit-tested; the screens only render it.
import { type Address, formatUnits } from 'viem'

import type { ExecutionPath } from '~/smart/execute'
import type { SendPreview } from '~/smart/preview'
import { type BatchQueue, type QueuedItem, cannotJoin } from '~/smart/queue'
import type { AccountMode, RpcCall } from '~/smart/types'

import { formatEth } from './formatEth'

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
  /** "Add to batch", offered only where the background would take it. */
  addToBatch: boolean
  /** The forward action: "Add to batch" once a batch is open for the account. */
  primary: 'batch' | 'approve'
  /** "Approve" reads "Sign anyway" and sends with `force`. */
  signAnyway: boolean
}

/** The actions of a send's approval screen. */
export function sendActions(args: {
  method: SendMethod
  preview: SendPreview | undefined
  from: Address
  calls: readonly RpcCall[]
  /** The active network's, which the preview is for. */
  rpcUrl: string
  queue: BatchQueue | null
}): SendActions {
  const { preview, queue, rpcUrl } = args
  // The background's own rule (a smart account, no deployment, the open batch
  // for this account and network), so a refusal is the exception.
  const addToBatch =
    preview !== undefined &&
    cannotJoin(
      queue,
      { rpcUrl, account: args.from, mode: preview.mode, calls: args.calls },
      rpcUrl,
    ) === null
  return {
    addToBatch,
    primary: addToBatch && queue !== null ? 'batch' : 'approve',
    signAnyway: signAnyway(args.method, preview),
  }
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

export function modeLabel(mode: AccountMode): string {
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
