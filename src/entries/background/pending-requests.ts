import { getMessenger } from '~/messengers'
import { pendingRequestsStore } from '~/zustand'
import type { PendingRequest } from '~/zustand/pending-requests'

const walletMessenger = getMessenger('background:wallet')

const liveRequests = new Set<number>()
const requestTimeout = 5 * 60 * 1000
const keepAliveInterval = 20 * 1000

export type Decision =
    | { status: 'approved'; request: PendingRequest }
    | { status: 'rejected' | 'expired' }

export async function requestUserDecision(request: PendingRequest): Promise<Decision> {
  const decision = waitForDecision(request)
  await addPendingRequest(request)
  return decision
}

export async function dropOrphanedRequests() {
  await hydrated()

  const { pendingRequests, removePendingRequest } =
      pendingRequestsStore.getState()
  for (const request of pendingRequests)
    if (!liveRequests.has(request.id)) removePendingRequest(request.id)
}

function waitForDecision(request: PendingRequest) {
  return new Promise<Decision>((resolve) => {
    liveRequests.add(request.id)
    startKeepAlive()

    const unsubscribe = walletMessenger.reply(
        'pendingRequest',
        async ({ request: pendingRequest, status }) => {
          if (pendingRequest.id !== request.id) return
          settle(
              status === 'approved'
                  ? { status, request: pendingRequest }
                  : { status },
          )
        },
    )

    const timeout = setTimeout(
        () => settle({ status: 'expired' }),
        requestTimeout,
    )

    const settle = (decision: Decision) => {
      unsubscribe()
      clearTimeout(timeout)
      liveRequests.delete(request.id)
      stopKeepAlive()
      pendingRequestsStore.getState().removePendingRequest(request.id)
      resolve(decision)
    }
  })
}

async function addPendingRequest(request: PendingRequest) {
  await hydrated()
  pendingRequestsStore.getState().addPendingRequest(request)
}

function hydrated() {
  if (pendingRequestsStore.persist.hasHydrated()) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const unsubscribe = pendingRequestsStore.persist.onFinishHydration(() => {
      unsubscribe()
      resolve()
    })
  })
}

let keepAlive: ReturnType<typeof setInterval> | undefined

function startKeepAlive() {
  if (keepAlive) return
  keepAlive = setInterval(
      () => chrome.runtime.getPlatformInfo(),
      keepAliveInterval,
  )
}

function stopKeepAlive() {
  if (liveRequests.size > 0) return
  clearInterval(keepAlive)
  keepAlive = undefined
}