import { getMessenger } from '~/messengers'
import type { Schema } from '~/messengers/schema'
import { orphaned } from '~/smart/queue'
import type { RpcResponse } from '~/types/rpc'
import { batchQueueStore, networkStore, pendingRequestsStore } from '~/zustand'
import type { PendingRequest } from '~/zustand/pending-requests'

import {
  type DeclineStatus,
  closesOnNetworkChange,
  networkSwitched,
  onNetworkChange,
} from './methods'
import { editQueue } from './send-shared'

const walletMessenger = getMessenger('background:wallet')

const liveRequests = new Set<number>()
const requestTimeout = 5 * 60 * 1000
const keepAliveInterval = 20 * 1000

/**
 * The requests waiting in the batch queue, by the background's own request
 * id. Each is answered when the batch is signed, or when it leaves the batch
 * any other way; none expires.
 */
const queuedWaiters = new Map<number, (r: RpcResponse) => void>()

/** A request that joined the batch queue. */
export type Joined = {
  /** Its response, once the batch is signed or the request leaves it. */
  queued: Promise<RpcResponse>
}

export type Decision =
    | { status: 'approved'; request: PendingRequest; force?: boolean }
    | ({ status: 'batched' } & Joined)
    | { status: DeclineStatus }

/** The decision on a request that can't be batched. */
export type PlainDecision = Exclude<Decision, { status: 'batched' }>

/**
 * "Add to batch": adds the request, as the approval screen sent it back, to
 * the batch queue. Resolves once it has joined; throws when it can't.
 */
export type Batcher = (request: PendingRequest) => Promise<Joined>

/**
 * Shows the request to the user and waits for their decision. With `batch`,
 * "Add to batch" is a decision too; without it, it is refused and the request
 * stays pending.
 */
export function requestUserDecision(
    request: PendingRequest,
): Promise<PlainDecision>
export function requestUserDecision(
    request: PendingRequest,
    options: { batch: Batcher },
): Promise<Decision>
export async function requestUserDecision(
    request: PendingRequest,
    options: { batch?: Batcher } = {},
): Promise<Decision> {
  const decision = waitForDecision(request, options.batch)
  await addPendingRequest(request)
  return decision
}

let sweep: Promise<void> | undefined

/**
 * Drops what no handler waits on, as after a worker restart: the pending
 * requests, and the batch queue when any of its requests is orphaned. Runs
 * once per worker; the batch queue's code waits for it, so nothing joins a
 * batch left from before.
 */
export function dropOrphanedRequests(): Promise<void> {
  sweep ??= dropOrphans()
  return sweep
}

async function dropOrphans() {
  await Promise.all([hydrated(pendingRequestsStore), hydrated(batchQueueStore)])

  const { pendingRequests, removePendingRequest } =
      pendingRequestsStore.getState()
  for (const request of pendingRequests)
    if (!liveRequests.has(request.id)) removePendingRequest(request.id)

  // A known limitation: the requests of a batch left from before the restart
  // are never answered. Their waiters were in the old worker's memory, and
  // after the usual restart (an extension reload) the pages' content scripts
  // are gone too, so no answer could reach them. The batch just closes, and
  // those pages' requests stay pending, like an approval's would.
  const { queue } = batchQueueStore.getState()
  if (queue && orphaned(queue.items, queuedRequestIds()).length > 0)
    editQueue(() => null)
}

/** Parks a request in the batch queue until `answerQueued` answers it. */
export function waitInQueue(requestId: number): Promise<RpcResponse> {
  startKeepAlive()
  return new Promise((resolve) => queuedWaiters.set(requestId, resolve))
}

/** Answers a request waiting in the batch queue; skipped if it isn't. */
export function answerQueued(requestId: number, response: RpcResponse): void {
  const waiter = queuedWaiters.get(requestId)
  if (!waiter) return
  queuedWaiters.delete(requestId)
  stopKeepAlive()
  waiter(response)
}

/** The ids of the requests waiting in the batch queue. */
export function queuedRequestIds(): Set<number> {
  return new Set(queuedWaiters.keys())
}

type Decide = (payload: Schema['pendingRequest'][0]) => Promise<void>

/** How each pending request takes its decision, by request id. */
const deciders = new Map<number, Decide>()

/**
 * The pending approvals a network change closes (`closesOnNetworkChange`),
 * by request id: a send or signature would go to the old network's node,
 * while the screen shows the new one.
 */
const closeOnNetworkChange = new Map<number, () => void>()

/**
 * Takes the user's decisions, with one reply for all pending requests: with
 * one per request, every one of them would answer each decision, the first
 * answer would win, and a refused "Add to batch" could be lost behind another
 * request's empty reply. A decision on no pending request gets an empty one.
 *
 * A network change answers the pending sends and signatures with 4001, as
 * it does the batch queue's (`batch-queue.ts`).
 */
export function setupPendingRequests() {
  walletMessenger.reply('pendingRequest', async (payload) => {
    await deciders.get(payload.request.id)?.(payload)
  })
  networkStore.subscribe((state, prev) => {
    if (!networkSwitched(state, prev)) return
    for (const close of [...closeOnNetworkChange.values()]) close()
  })
}

function waitForDecision(request: PendingRequest, batch?: Batcher) {
  return new Promise<Decision>((resolve) => {
    liveRequests.add(request.id)
    startKeepAlive()

    const expire = () => settle({ status: 'expired' })
    let timeout = setTimeout(expire, requestTimeout)
    let joining = false
    // The network changed while "Add to batch" was under way.
    let switchedWhileJoining = false
    if (closesOnNetworkChange(request.method))
      closeOnNetworkChange.set(request.id, () => {
        const action = onNetworkChange(request.method, { joining })
        if (action === 'close') settle({ status: 'network-changed' })
        if (action === 'close-if-join-fails') switchedWhileJoining = true
      })

    deciders.set(request.id, async ({ request: pendingRequest, status, force }) => {
      if (joining) throw new Error('The request is being added to the batch.')
      if (status !== 'batched') {
        settle(
            status === 'approved'
                ? { status, request: pendingRequest, force: force === true }
                : { status },
        )
        return
      }
      if (!batch) throw new Error("This request can't be added to a batch.")

      // A request in the batch never expires. One that can't join stays
      // pending, with its full time to decide again, unless the network
      // changed meanwhile: then it closes, as it would have (4001). One that
      // joined is the batch's to close (`leaveNetwork`).
      joining = true
      switchedWhileJoining = false
      clearTimeout(timeout)
      try {
        const { queued } = await batch(pendingRequest)
        settle({ status: 'batched', queued })
      } catch (error) {
        if (switchedWhileJoining) settle({ status: 'network-changed' })
        else timeout = setTimeout(expire, requestTimeout)
        throw error
      } finally {
        joining = false
      }
    })

    const settle = (decision: Decision) => {
      deciders.delete(request.id)
      closeOnNetworkChange.delete(request.id)
      clearTimeout(timeout)
      liveRequests.delete(request.id)
      stopKeepAlive()
      pendingRequestsStore.getState().removePendingRequest(request.id)
      resolve(decision)
    }
  })
}

async function addPendingRequest(request: PendingRequest) {
  await hydrated(pendingRequestsStore)
  pendingRequestsStore.getState().addPendingRequest(request)
}

type Persisted = {
  persist: {
    hasHydrated(): boolean
    onFinishHydration(listener: () => void): () => void
  }
}

/** Resolves once the store has loaded what it persisted. */
export function hydrated(store: Persisted) {
  if (store.persist.hasHydrated()) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const unsubscribe = store.persist.onFinishHydration(() => {
      unsubscribe()
      resolve()
    })
  })
}

let keepAlive: ReturnType<typeof setInterval> | undefined

// Calling an extension API resets the worker's idle timer, so the worker
// stays up while anyone waits: on an approval, or in the batch queue.
function startKeepAlive() {
  if (keepAlive) return
  keepAlive = setInterval(
      () => chrome.runtime.getPlatformInfo(),
      keepAliveInterval,
  )
}

function stopKeepAlive() {
  if (liveRequests.size > 0 || queuedWaiters.size > 0) return
  clearInterval(keepAlive)
  keepAlive = undefined
}
