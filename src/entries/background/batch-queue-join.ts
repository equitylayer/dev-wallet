// Joining the batch queue (spec §7): a send joins the open batch, unasked
// with bypass on or when the user picks "Add to batch", which also opens one;
// "Start batch" opens an empty one. `smart-sends.ts` routes sends here, and
// `batch-queue.ts` signs, edits and closes the batch. Each change runs in its
// network's turn (`oneSendAtATime`).
import type { Address } from 'viem'

import {
  INVALID_PARAMS,
  WalletRpcError,
  unauthorizedAccount,
} from '~/smart/errors'
import {
  type BatchQueue,
  type QueuedItem,
  cannotJoin,
  enqueue,
  openQueue,
} from '~/smart/queue'
import { sendTransactionCall } from '~/smart/resolve'
import { type RpcCall, toRpcCall } from '~/smart/types'
import {
  type WalletAccount,
  type WalletCoreDeps,
  findAccount,
} from '~/smart/wallet-core'
import type { RpcRequest } from '~/types/rpc'
import { batchQueueStore } from '~/zustand'

import { type Joined, dropOrphanedRequests, waitInQueue } from './pending-requests'
import {
  type IncomingSend,
  activeRpcUrl,
  editQueue,
  firstParam,
  oneSendAtATime,
  parseBatch,
} from './send-shared'
import { reconcileSnapshot } from './smart'

/** The open batch, once its store is loaded and a stale one is swept. */
export async function openBatch(): Promise<BatchQueue | null> {
  await dropOrphanedRequests()
  return batchQueueStore.getState().queue
}

type Entry = Pick<QueuedItem, 'method' | 'calls' | 'bundleId'> & {
  from: string
}

/**
 * What a send adds to the batch: the request as the approval screen sent it
 * back (`request`), over the dApp's (`original`).
 *
 * @throws The request's own errors, as a send would (`-32602`, `5720`, …).
 */
function queueEntry(
  deps: WalletCoreDeps,
  original: RpcRequest,
  request: RpcRequest,
): Entry {
  if (original.method === 'wallet_sendCalls') {
    const batch = parseBatch(deps, request)
    return {
      method: 'wallet_sendCalls',
      from: batch.from,
      calls: batch.calls.map(toRpcCall),
      bundleId: batch.id,
    }
  }
  const tx = { ...firstParam(original), ...firstParam(request) }
  if (typeof tx.from !== 'string') {
    throw new WalletRpcError(INVALID_PARAMS, 'The transaction has no `from`')
  }
  return {
    method: 'eth_sendTransaction',
    from: tx.from,
    calls: [toRpcCall(sendTransactionCall(tx))],
  }
}

/** Why `account` can't open or join a batch on `rpcUrl` now, or `null`. */
function refusal(
  rpcUrl: string,
  account: WalletAccount,
  calls: readonly RpcCall[],
): string | null {
  return cannotJoin(
    batchQueueStore.getState().queue,
    { rpcUrl, account: account.address, mode: account.mode, calls },
    activeRpcUrl(),
  )
}

/** Opens a batch for `account`, unless one is open already. */
function open(rpcUrl: string, account: Address) {
  editQueue((queue) => openQueue(queue, { rpcUrl, account }, Date.now()))
}

/** Parks the send in the open batch until it is signed or leaves it. */
function park(send: IncomingSend, entry: Entry): Joined {
  const { id } = send.request
  const queued = waitInQueue(id)
  editQueue((queue) =>
    enqueue(queue, {
      requestId: id,
      origin: send.origin,
      method: entry.method,
      calls: entry.calls,
      ...(entry.bundleId !== undefined && { bundleId: entry.bundleId }),
      addedAt: Date.now(),
    }),
  )
  return { queued }
}

/**
 * "Start batch": opens an empty batch for `account` on `rpcUrl`. Nothing
 * changes when that batch is open already.
 *
 * @throws Why it can't, like "Add to batch" (`-32602`): another network than
 * the active one, a plain account, or a batch open for another account.
 */
export function startBatch(rpcUrl: string, address: Address): Promise<void> {
  return oneSendAtATime(rpcUrl, async () => {
    await openBatch()
    const { deps } = await reconcileSnapshot(rpcUrl)
    const account = findAccount(deps.accounts, address)
    if (!account) throw unauthorizedAccount(address)
    const refused = refusal(rpcUrl, account, [])
    if (refused) throw new WalletRpcError(INVALID_PARAMS, refused)
    open(rpcUrl, account.address)
  })
}

/**
 * "Add to batch": the send joins the open batch, or opens one for its
 * account. It takes its network's turn among the sends.
 *
 * @throws Why it can't join (the request then stays pending): another network
 * than the active one, a plain account, a deployment, or a batch open for
 * another account or network.
 */
export function addToBatch(
  send: IncomingSend,
  request: RpcRequest,
): Promise<Joined> {
  const { rpcUrl } = send
  return oneSendAtATime(rpcUrl, async () => {
    await openBatch()
    const { deps } = await reconcileSnapshot(rpcUrl, { fresh: true })
    const entry = queueEntry(deps, send.request, request)
    const account = findAccount(deps.accounts, entry.from)
    if (!account) throw unauthorizedAccount(entry.from)
    const refused = refusal(rpcUrl, account, entry.calls)
    if (refused) throw new WalletRpcError(INVALID_PARAMS, refused)
    open(rpcUrl, account.address)
    return park(send, entry)
  })
}

/**
 * With nobody asked (bypass on), a send from the open batch's account joins
 * it unasked. `undefined` when the send goes out now: there is no batch on
 * its network, or one it can't join. Call it in the network's turn.
 */
export async function joinUnasked(
  send: IncomingSend,
  request: RpcRequest,
): Promise<Joined | undefined> {
  const { rpcUrl } = send
  if ((await openBatch())?.rpcUrl !== rpcUrl) return undefined
  const { deps } = await reconcileSnapshot(rpcUrl, { fresh: true })
  let entry: Entry
  try {
    entry = queueEntry(deps, send.request, request)
  } catch {
    // Sent now, the request reports its own errors.
    return undefined
  }
  const account = findAccount(deps.accounts, entry.from)
  const joins =
    account !== undefined &&
    batchQueueStore.getState().queue !== null &&
    refusal(rpcUrl, account, entry.calls) === null
  return joins ? park(send, entry) : undefined
}
