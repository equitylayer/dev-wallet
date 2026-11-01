// The batch queue (Ambire-style, spec §7): sends from one smart account on one
// network wait in it, then go out together as one execution. Chrome-free: the
// store (`~/zustand/batch-queue`) and the background glue build on these.
import type { Address, Hash } from 'viem'

import type { BatchRecord } from './batch-records'
import type { ExecutionResult } from './execute'
import type { AccountMode, RpcCall } from './types'

/** The origin of a send made from DevWallet's own screens. */
export const DEVWALLET_ORIGIN = 'DevWallet'

/** A request waiting in the queue. A `wallet_sendCalls` is one item. */
export type QueuedItem = {
  /** The background's own id for the request, never the page's. */
  requestId: number
  /** The site's host, or `DEVWALLET_ORIGIN`. */
  origin: string
  method: 'eth_sendTransaction' | 'wallet_sendCalls'
  calls: RpcCall[]
  /** The id a `wallet_sendCalls` gets back. */
  bundleId?: string
  addedAt: number
}

/** The open batch: at most one, for one account on one network. */
export type BatchQueue = {
  rpcUrl: string
  account: Address
  items: QueuedItem[]
  openedAt: number
}

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** The calls of the queue, in order; a group's calls stay together. */
export function flattenQueue(items: readonly QueuedItem[]): RpcCall[] {
  return items.flatMap((item) => item.calls)
}

/** How many sites wait on the queue (DevWallet's own screens don't count). */
export function waitingSites(items: readonly QueuedItem[]): number {
  return new Set(
    items.map((i) => i.origin).filter((o) => o !== DEVWALLET_ORIGIN),
  ).size
}

/**
 * What each queued request resolves to once the queue is signed: an
 * `eth_sendTransaction` gets the hash of the transaction that carried it, a
 * `wallet_sendCalls` its batch id.
 */
export function resolutions(
  items: readonly QueuedItem[],
  result: { transactionHash: Hash; recordIds: Record<number, string> },
): Map<number, unknown> {
  return new Map(
    items.map((item) => [
      item.requestId,
      item.method === 'wallet_sendCalls'
        ? { id: result.recordIds[item.requestId] }
        : result.transactionHash,
    ]),
  )
}

/** The queued requests nobody waits on any more (all, after a restart). */
export function orphaned(
  items: readonly QueuedItem[],
  liveRequestIds: ReadonlySet<number>,
): number[] {
  return items
    .map((i) => i.requestId)
    .filter((id) => !liveRequestIds.has(id))
}

/**
 * The queue once the wallet is on `newRpcUrl`: a queue on another network
 * closes, and every request in it is rejected.
 */
export function queueAfterNetworkChange(
  queue: BatchQueue | null,
  newRpcUrl: string,
): { queue: BatchQueue | null; reject: number[] } {
  if (!queue || queue.rpcUrl === newRpcUrl) return { queue, reject: [] }
  return { queue: null, reject: queue.items.map((i) => i.requestId) }
}

/**
 * Why a send can't join `queue` (or open one, when there is none), or `null`
 * when it can. Batches are for the active network only; only a smart account
 * batches (a plain account gets the upgrade offer instead); a deployment
 * never does (spec §4); and an open queue takes only its own account and
 * network.
 */
export function cannotJoin(
  queue: BatchQueue | null,
  send: {
    rpcUrl: string
    account: Address
    mode: AccountMode
    calls: readonly RpcCall[]
  },
  activeRpcUrl: string,
): string | null {
  if (send.rpcUrl !== activeRpcUrl) {
    return `Batches are only for the active network, not ${send.rpcUrl}.`
  }
  if (send.mode !== 'smart') {
    return `Only smart accounts can batch: ${send.account} is ${send.mode}.`
  }
  if (send.calls.some((call) => call.to === undefined)) {
    return "A contract deployment can't join a batch."
  }
  if (!queue) return null
  if (queue.rpcUrl !== send.rpcUrl) {
    return `A batch is already open on another network (${queue.rpcUrl}).`
  }
  if (!sameAddress(queue.account, send.account)) {
    return `A batch is already open for ${queue.account}.`
  }
  return null
}

// -- edits (the store's actions) ----------------------------------------------

/** Opens an empty queue. An open one is never replaced: discard it first. */
export function openQueue(
  queue: BatchQueue | null,
  { rpcUrl, account }: { rpcUrl: string; account: Address },
  now: number,
): BatchQueue {
  return queue ?? { rpcUrl, account, items: [], openedAt: now }
}

export function enqueue(
  queue: BatchQueue | null,
  item: QueuedItem,
): BatchQueue | null {
  return queue && { ...queue, items: [...queue.items, item] }
}

/** Moves the item at `from` to `to`; out of range changes nothing. */
export function moveItem(
  queue: BatchQueue | null,
  from: number,
  to: number,
): BatchQueue | null {
  if (!queue) return queue
  const inRange = (i: number) =>
    Number.isInteger(i) && i >= 0 && i < queue.items.length
  if (!inRange(from) || !inRange(to) || from === to) return queue
  const items = [...queue.items]
  const [moved] = items.splice(from, 1)
  items.splice(to, 0, moved as QueuedItem)
  return { ...queue, items }
}

export function removeItem(
  queue: BatchQueue | null,
  requestId: number,
): BatchQueue | null {
  if (!queue?.items.some((i) => i.requestId === requestId)) return queue
  return { ...queue, items: queue.items.filter((i) => i.requestId !== requestId) }
}

// -- signing ------------------------------------------------------------------

/**
 * The batch records of a signed queue: one per queued `wallet_sendCalls`,
 * holding its own calls and the shared execution's result, so
 * `wallet_getCallsStatus` reports that execution for each of them.
 */
export function queueRecords(args: {
  rpcUrl: string
  chainId: number
  from: Address
  items: readonly QueuedItem[]
  result: Pick<ExecutionResult, 'path' | 'transactionHashes' | 'userOpHash'>
  createdAt: number
}): { records: BatchRecord[]; recordIds: Record<number, string> } {
  const { result } = args
  const records: BatchRecord[] = []
  const recordIds: Record<number, string> = {}
  for (const item of args.items) {
    if (item.method !== 'wallet_sendCalls' || item.bundleId === undefined) {
      continue
    }
    records.push({
      id: item.bundleId,
      rpcUrl: args.rpcUrl,
      chainId: args.chainId,
      from: args.from,
      calls: item.calls,
      path: result.path,
      transactionHashes: result.transactionHashes,
      ...(result.userOpHash && { userOpHash: result.userOpHash }),
      createdAt: args.createdAt,
    })
    recordIds[item.requestId] = item.bundleId
  }
  return { records, recordIds }
}
