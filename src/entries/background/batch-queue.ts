// The batch queue's background side (spec §7). Sends join it from
// `smart-sends.ts`; the batch review signs or discards it (the `batchQueue`
// message); and a request that leaves it any other way (the user removed it,
// or the network changed) is declined with 4001. The rules are pure, in
// `~/smart/queue`.
import type { Hash } from 'viem'

import { getMessenger } from '~/messengers'
import type { Schema } from '~/messengers/schema'
import {
  INVALID_PARAMS,
  WalletRpcError,
  serializeError,
  unauthorizedAccount,
} from '~/smart/errors'
import { executeCalls } from '~/smart/execute'
import {
  type BatchQueue,
  type QueuedItem,
  cannotJoin,
  droppedItems,
  flattenQueue,
  orphaned,
  queueAfterNetworkChange,
  queueRecords,
  resolutions,
} from '~/smart/queue'
import { sendTransactionCall } from '~/smart/resolve'
import { toCall, toRpcCall } from '~/smart/types'
import { type WalletCoreDeps, findAccount } from '~/smart/wallet-core'
import type { RpcRequest } from '~/types/rpc'
import { batchQueueStore, networkStore } from '~/zustand'

import { USER_REJECTED } from './methods'
import {
  type Joined,
  answerQueued,
  dropOrphanedRequests,
  hydrated,
  queuedRequestIds,
  waitInQueue,
} from './pending-requests'
import {
  type IncomingSend,
  firstParam,
  oneSendAtATime,
  parseBatch,
} from './send-shared'
import { invalidate, reconcileSnapshot } from './smart'

const walletMessenger = getMessenger('background:wallet')

const EXECUTION_REVERTED = 3

////////////////////////////////////////////////////////////////////////
// Joining

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

/** Parks the send in the open batch until it is signed or leaves it. */
function park(send: IncomingSend, entry: Entry): Joined {
  const { id } = send.request
  const queued = waitInQueue(id)
  batchQueueStore.getState().enqueue({
    requestId: id,
    origin: send.origin,
    method: entry.method,
    calls: entry.calls,
    ...(entry.bundleId !== undefined && { bundleId: entry.bundleId }),
    addedAt: Date.now(),
  })
  return { queued }
}

/**
 * "Add to batch": the send joins the open batch, or opens one for its
 * account. It takes its network's turn among the sends.
 *
 * @throws Why it can't join (the request then stays pending): a plain
 * account, a deployment, or a batch open for another account or network.
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

    const { queue } = batchQueueStore.getState()
    const refusal = cannotJoin(queue, {
      rpcUrl,
      account: account.address,
      mode: account.mode,
      calls: entry.calls,
    })
    if (refusal) throw new Error(refusal)
    if (!queue) {
      batchQueueStore.getState().openQueue({ rpcUrl, account: account.address })
    }
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
  const { queue } = batchQueueStore.getState()
  const joins =
    account !== undefined &&
    queue !== null &&
    cannotJoin(queue, {
      rpcUrl,
      account: account.address,
      mode: account.mode,
      calls: entry.calls,
    }) === null
  return joins ? park(send, entry) : undefined
}

////////////////////////////////////////////////////////////////////////
// Leaving: signed, discarded, removed by the user, or off the network

type BatchQueueResult = Schema['batchQueue'][1]

/** The requests of the batch being signed: the signing answers them. */
let signing: ReadonlySet<number> = new Set()

function answer(
  requestId: number,
  outcome: { result: unknown } | { error: unknown },
) {
  answerQueued(
    requestId,
    'result' in outcome
      ? { id: requestId, jsonrpc: '2.0', result: outcome.result }
      : { id: requestId, jsonrpc: '2.0', error: serializeError(outcome.error) },
  )
}

/** Rejects requests that left the batch, except any being signed. */
function decline(requestIds: readonly number[], message: string) {
  const error = new WalletRpcError(USER_REJECTED, message)
  for (const id of requestIds) if (!signing.has(id)) answer(id, { error })
}

function failed(error: unknown): BatchQueueResult {
  return { ok: false, error: serializeError(error) }
}

const invalid = (message: string) => new WalletRpcError(INVALID_PARAMS, message)

/** Clears the queue if it is still the one signed. */
function closeIfSigned(signed: BatchQueue) {
  const { queue, clearQueue } = batchQueueStore.getState()
  if (queue?.openedAt === signed.openedAt && queue.rpcUrl === signed.rpcUrl) {
    clearQueue()
  }
}

async function sign(force: boolean): Promise<BatchQueueResult> {
  const opened = await openBatch()
  if (!opened) return failed(invalid('No batch is open.'))
  return oneSendAtATime(opened.rpcUrl, () => signTurn(opened.rpcUrl, force))
}

/**
 * Sends the open batch as one execution (spec §4), in its network's turn.
 * Each waiting request gets its own answer from that execution. A predicted
 * revert nobody forced is every request's answer too, and closes the batch;
 * any other failure leaves the batch open, to try again or discard.
 */
async function signTurn(
  rpcUrl: string,
  force: boolean,
): Promise<BatchQueueResult> {
  const { queue } = batchQueueStore.getState()
  if (queue?.rpcUrl !== rpcUrl) return failed(invalid('No batch is open.'))
  const { items } = queue
  if (items.length === 0) return failed(invalid('The batch is empty.'))
  // Never send a call whose request was answered already: a lost edit from
  // the side panel can bring back one it removed.
  const answeredAlready = orphaned(items, queuedRequestIds())
  if (answeredAlready.length > 0) {
    for (const id of answeredAlready) {
      batchQueueStore.getState().removeItem(id)
    }
    return failed(
      invalid('Some requests in the batch were answered already. Review it again.'),
    )
  }

  signing = new Set(items.map((i) => i.requestId))
  try {
    const { deps } = await reconcileSnapshot(rpcUrl, { fresh: true })
    const account = findAccount(deps.accounts, queue.account)
    if (!account) throw unauthorizedAccount(queue.account)
    const result = await executeCalls({
      node: deps.node,
      chainId: deps.chainId,
      account,
      calls: flattenQueue(items).map(toCall),
      atomicRequired: true,
      sponsor: deps.sponsor,
      force,
    })

    const { records, recordIds } = queueRecords({
      rpcUrl,
      chainId: deps.chainId,
      from: account.address,
      items,
      result,
      createdAt: Date.now(),
    })
    for (const record of records) deps.records.put(record)
    // One transaction carries the whole batch: `handleOps`, or the self-call.
    const transactionHash = result.transactionHashes[0] as Hash
    // Answered before the queue is cleared, so clearing it declines none.
    for (const [id, value] of resolutions(items, { transactionHash, recordIds })) {
      answer(id, { result: value })
    }
    closeIfSigned(queue)
    return { ok: true }
  } catch (error) {
    signing = new Set()
    if (!force && serializeError(error).code === EXECUTION_REVERTED) {
      // Nobody forced it ("Sign anyway"), so every waiting request gets the
      // predicted revert, as a send nobody was asked about would (spec §4).
      for (const { requestId } of items) answer(requestId, { error })
      closeIfSigned(queue)
    } else {
      decline(
        droppedItems(items, batchQueueStore.getState().queue?.items ?? []),
        'The request left the batch while it was being signed.',
      )
    }
    return failed(error)
  } finally {
    signing = new Set()
    invalidate(rpcUrl)
  }
}

async function discard(): Promise<BatchQueueResult> {
  const opened = await openBatch()
  if (!opened) return { ok: true }
  // In the network's turn, so a batch being signed isn't discarded under it.
  return oneSendAtATime(opened.rpcUrl, async () => {
    const { queue, clearQueue } = batchQueueStore.getState()
    if (!queue) return { ok: true }
    // Declined before the queue is cleared, so each gets this reason.
    decline(
      queue.items.map((i) => i.requestId),
      'The user discarded the batch.',
    )
    clearQueue()
    return { ok: true }
  })
}

/** A batch belongs to one network: on any other, it closes. */
function leaveNetwork(rpcUrl: string | undefined) {
  const { queue, clearQueue } = batchQueueStore.getState()
  const next = queueAfterNetworkChange(queue, rpcUrl ?? '')
  if (next.queue === queue) return
  decline(next.reject, 'The network changed while the request waited in a batch.')
  clearQueue()
}

export function setupBatchQueue() {
  walletMessenger.reply('batchQueue', async (payload) => {
    if (payload?.action === 'sign') return sign(payload.force === true)
    if (payload?.action === 'discard') return discard()
    return failed(invalid('Unknown batch action.'))
  })

  // Requests the user removed on the batch review. Every other way out
  // answers its requests before the queue changes, so they are skipped here.
  batchQueueStore.subscribe((state, prev) => {
    decline(
      droppedItems(prev.queue?.items ?? [], state.queue?.items ?? []),
      'The user removed the request from the batch.',
    )
  })

  networkStore.subscribe((state, prev) => {
    if (state.network?.rpcUrl !== prev.network?.rpcUrl) {
      leaveNetwork(state.network?.rpcUrl)
    }
  })
  // And a batch left on another network while the worker was stopped.
  void Promise.all([dropOrphanedRequests(), hydrated(networkStore)]).then(() =>
    leaveNetwork(networkStore.getState().network?.rpcUrl),
  )
}
