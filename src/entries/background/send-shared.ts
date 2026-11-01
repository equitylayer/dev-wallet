// What the send flow (`smart-sends.ts`) and the batch queue
// (`batch-queue*.ts`) share: the turns sends take on a network, reading a
// send's params, and writing the queue.
import { type ParsedSendCalls, parseSendCalls } from '~/smart/eip5792'
import { duplicateBundleId } from '~/smart/errors'
import type { BatchQueue } from '~/smart/queue'
import type { WalletCoreDeps } from '~/smart/wallet-core'
import type { RpcRequest } from '~/types/rpc'
import { serialPerKey } from '~/utils/serial'
import { batchQueueStore, networkStore } from '~/zustand'

/** A send as it arrives: a site's, or one from DevWallet's own screens. */
export type IncomingSend = {
  rpcUrl: string
  /** The site's host, or `DEVWALLET_ORIGIN` (`~/smart/queue`). */
  origin: string
  /** With the background's own id (`rpc.ts`), never the page's. */
  request: RpcRequest
}

/**
 * One send per rpcUrl at a time, from its fresh reconcile to its last
 * transaction: concurrent sends race for the sponsor's funding nonce
 * ("Couldn't fund the sponsor: nonce too low"). Approvals wait outside it,
 * and previews don't need it. Every change to the batch queue takes its
 * network's turn too (joining, editing, signing, closing), so each sees the
 * last, and nothing changes a batch while it is being signed. Never nested in
 * `exclusive`, which the reconciles inside it use.
 */
export const oneSendAtATime = serialPerKey()

/**
 * Writes the batch queue. Only the background does, in the queue's network's
 * turn (`oneSendAtATime`); see `~/zustand/batch-queue`.
 */
export function editQueue(
  edit: (queue: BatchQueue | null) => BatchQueue | null,
): void {
  batchQueueStore.setState({ queue: edit(batchQueueStore.getState().queue) })
}

/** The rpcUrl of the wallet's active network. */
export function activeRpcUrl(): string {
  return networkStore.getState().network?.rpcUrl ?? ''
}

export function firstParam(request: RpcRequest): Record<string, unknown> {
  const [param] = (request.params ?? []) as unknown[]
  return typeof param === 'object' && param !== null
    ? (param as Record<string, unknown>)
    : {}
}

/**
 * `wallet_sendCalls` params, checked against the network (`deps`). A batch
 * waiting in the queue has no record yet, but its id is taken too, so the
 * queue's store must be loaded (`openBatch`).
 */
export function parseBatch(
  deps: WalletCoreDeps,
  request: RpcRequest,
): ParsedSendCalls {
  const batch = parseSendCalls(request.params, {
    chainId: deps.chainId,
    activeAccount: deps.activeAccount,
    knownAccounts: deps.accounts.map((a) => a.address),
    records: deps.records,
  })
  const { queue } = batchQueueStore.getState()
  if (queue?.items.some((item) => item.bundleId === batch.id)) {
    throw duplicateBundleId(batch.id)
  }
  return batch
}
