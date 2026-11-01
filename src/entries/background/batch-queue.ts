// The open batch's background side (spec §7): the batch review's `batchQueue`
// messages (open, remove, move, sign, discard), and closing the batch when
// the network changes. Sends join it in `batch-queue-join.ts`. The background
// is the batch's only writer, and every change runs in the batch's network's
// turn (`oneSendAtATime`), like the sends and joins, so each sees the last.
// The rules are pure, in `~/smart/queue`.
import { type Hash, isAddress } from 'viem'

import { getMessenger } from '~/messengers'
import type { Schema } from '~/messengers/schema'
import {
  EXECUTION_REVERTED,
  INVALID_PARAMS,
  WalletRpcError,
  batchChanged,
  serializeError,
  unauthorizedAccount,
} from '~/smart/errors'
import { type ExecutionResult, executeCalls } from '~/smart/execute'
import {
  type BatchQueue,
  flattenQueue,
  matchesReview,
  moveItem,
  queueAfterNetworkChange,
  queueRecords,
  removeItem,
  resolutions,
} from '~/smart/queue'
import { toCall } from '~/smart/types'
import {
  type WalletAccount,
  type WalletCoreDeps,
  findAccount,
} from '~/smart/wallet-core'
import { batchQueueStore, networkStore } from '~/zustand'

import { openBatch, startBatch } from './batch-queue-join'
import { USER_REJECTED, networkSwitched } from './methods'
import { answerQueued, hydrated } from './pending-requests'
import { activeRpcUrl, editQueue, oneSendAtATime } from './send-shared'
import { invalidate, reconcileSnapshot } from './smart'

const walletMessenger = getMessenger('background:wallet')

type BatchQueueResult = Schema['batchQueue'][1]

const ok: BatchQueueResult = { ok: true }

function failed(error: unknown): BatchQueueResult {
  return { ok: false, error: serializeError(error) }
}

const invalid = (message: string) => new WalletRpcError(INVALID_PARAMS, message)
const noBatch = () => invalid('No batch is open.')

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

/** Rejects requests that leave the batch unsent, with 4001. */
function decline(requestIds: readonly number[], message: string) {
  const error = new WalletRpcError(USER_REJECTED, message)
  for (const id of requestIds) answer(id, { error })
}

/**
 * Runs `task` on the open batch in its network's turn, after every send,
 * join, edit or signing already under way there, so it sees their outcome.
 * `task` gets `null` when no batch is open (any more).
 *
 * Each task answers the requests it takes out of the batch in the same step
 * as it takes them out, so every request in the batch is still waiting.
 */
async function withOpenBatch<T>(
  task: (queue: BatchQueue | null) => T | Promise<T>,
): Promise<T> {
  const opened = await openBatch()
  if (!opened) return task(null)
  return oneSendAtATime(opened.rpcUrl, async () => {
    const { queue } = batchQueueStore.getState()
    return task(queue?.rpcUrl === opened.rpcUrl ? queue : null)
  })
}

////////////////////////////////////////////////////////////////////////
// Sign

type Sent = { deps: WalletCoreDeps; account: WalletAccount; result: ExecutionResult }

/** Sends the batch as one execution (spec §4). */
async function send(queue: BatchQueue, force: boolean): Promise<Sent> {
  const { rpcUrl } = queue
  try {
    const { deps } = await reconcileSnapshot(rpcUrl, { fresh: true })
    const account = findAccount(deps.accounts, queue.account)
    if (!account) throw unauthorizedAccount(queue.account)
    const result = await executeCalls({
      node: deps.node,
      chainId: deps.chainId,
      account,
      calls: flattenQueue(queue.items).map(toCall),
      atomicRequired: true,
      sponsor: deps.sponsor,
      force,
    })
    return { deps, account, result }
  } finally {
    invalidate(rpcUrl)
  }
}

/**
 * Once the batch went out: records it, answers each request, and closes the
 * batch. It closes even if recording throws, so it is never sent twice.
 */
function settle(queue: BatchQueue, { deps, account, result }: Sent) {
  const { items, rpcUrl } = queue
  const { records, recordIds } = queueRecords({
    rpcUrl,
    chainId: deps.chainId,
    from: account.address,
    items,
    result,
    createdAt: Date.now(),
  })
  try {
    // Before the answers: a dApp may ask for its batch's status at once.
    for (const record of records) deps.records.put(record)
  } finally {
    // One transaction carries the whole batch: `handleOps`, or the self-call.
    const transactionHash = result.transactionHashes[0] as Hash
    for (const [id, value] of resolutions(items, { transactionHash, recordIds })) {
      answer(id, { result: value })
    }
    editQueue(() => null)
  }
}

/**
 * Signs the open batch: each request gets its own answer from the one
 * execution. Only the batch as reviewed is signed: the requests in `reviewed`,
 * in that order; one that changed since (a join, an edit) is refused, and
 * nothing is sent. A predicted revert nobody forced is every request's answer
 * too, and closes the batch; a failure before anything is sent leaves the
 * batch open, to try again or discard.
 */
function sign(
  reviewed: readonly number[],
  force: boolean,
): Promise<BatchQueueResult> {
  return withOpenBatch(async (queue) => {
    if (!queue) return failed(noBatch())
    if (!matchesReview(queue.items, reviewed)) return failed(batchChanged())
    if (queue.items.length === 0) return failed(invalid('The batch is empty.'))
    let sent: Sent
    try {
      sent = await send(queue, force)
    } catch (error) {
      if (!force && serializeError(error).code === EXECUTION_REVERTED) {
        // Nobody forced it ("Sign anyway"), so every waiting request gets the
        // predicted revert, as a send nobody was asked about would (spec §4).
        for (const { requestId } of queue.items) answer(requestId, { error })
        editQueue(() => null)
      }
      return failed(error)
    }
    settle(queue, sent)
    return ok
  })
}

////////////////////////////////////////////////////////////////////////
// Discard, edits, and the network

function discard(): Promise<BatchQueueResult> {
  return withOpenBatch((queue) => {
    if (!queue) return ok
    decline(
      queue.items.map((i) => i.requestId),
      'The user discarded the batch.',
    )
    editQueue(() => null)
    return ok
  })
}

/** Takes a request (a `wallet_sendCalls` as a whole) out of the batch. */
function remove(requestId: number): Promise<BatchQueueResult> {
  return withOpenBatch((queue) => {
    if (!queue?.items.some((i) => i.requestId === requestId)) {
      return failed(invalid(`Request ${requestId} is not in the batch.`))
    }
    decline([requestId], 'The user removed the request from the batch.')
    editQueue((current) => removeItem(current, requestId))
    return ok
  })
}

/** Moves a request (a `wallet_sendCalls` whole) to position `to`. */
function move(requestId: number, to: number): Promise<BatchQueueResult> {
  return withOpenBatch((queue) => {
    if (!queue?.items.some((i) => i.requestId === requestId)) {
      return failed(invalid(`Request ${requestId} is not in the batch.`))
    }
    const { length } = queue.items
    if (to >= length) return failed(invalid(`The batch has ${length} items.`))
    editQueue((current) => moveItem(current, requestId, to))
    return ok
  })
}

/** A batch belongs to one network: once another is active, it closes. */
function leaveNetwork(): Promise<void> {
  return withOpenBatch((queue) => {
    const next = queueAfterNetworkChange(queue, activeRpcUrl())
    if (next.queue === queue) return
    decline(next.reject, 'The network changed while the request waited in a batch.')
    editQueue(() => null)
  })
}

/**
 * On worker start, once the network is loaded: a batch left on another
 * network (it may have changed while the worker was stopped) closes too.
 */
export async function closeStaleBatch(): Promise<void> {
  await hydrated(networkStore)
  await leaveNetwork()
}

////////////////////////////////////////////////////////////////////////
// Messages

const isPosition = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0

const isRequestIds = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((id) => Number.isSafeInteger(id))

/** The batch review's message, validated: a bad payload is `-32602`. */
async function handle(payload: unknown): Promise<BatchQueueResult> {
  const message = (
    typeof payload === 'object' && payload !== null ? payload : {}
  ) as Record<string, unknown>
  switch (message.action) {
    case 'sign':
      if (!isRequestIds(message.reviewed)) {
        return failed(invalid('Expected the reviewed requestIds to sign.'))
      }
      return sign(message.reviewed, message.force === true)
    case 'discard':
      return discard()
    case 'open': {
      const { rpcUrl, account } = message
      if (
        typeof rpcUrl !== 'string' ||
        typeof account !== 'string' ||
        !isAddress(account, { strict: false })
      ) {
        return failed(invalid('Expected { rpcUrl, account } to open a batch.'))
      }
      await startBatch(rpcUrl, account)
      return ok
    }
    case 'remove':
      if (!Number.isSafeInteger(message.requestId)) {
        return failed(invalid('Expected the requestId to remove.'))
      }
      return remove(message.requestId as number)
    case 'move':
      if (!Number.isSafeInteger(message.requestId) || !isPosition(message.to)) {
        return failed(invalid('Expected { requestId, to } to move.'))
      }
      return move(message.requestId as number, message.to)
    default:
      return failed(invalid(`Unknown batch action ${JSON.stringify(message.action)}.`))
  }
}

export function setupBatchQueue() {
  walletMessenger.reply('batchQueue', (payload) => handle(payload).catch(failed))

  networkStore.subscribe((state, prev) => {
    if (networkSwitched(state, prev)) void leaveNetwork()
  })
  void closeStaleBatch()
}
