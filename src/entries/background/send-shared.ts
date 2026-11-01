// What the send flow (`smart-sends.ts`) and the batch queue (`batch-queue.ts`)
// share: the turns sends take on a network, and reading a send's params.
import { type ParsedSendCalls, parseSendCalls } from '~/smart/eip5792'
import { duplicateBundleId } from '~/smart/errors'
import type { WalletCoreDeps } from '~/smart/wallet-core'
import type { RpcRequest } from '~/types/rpc'
import { serialPerKey } from '~/utils/serial'
import { batchQueueStore } from '~/zustand'

/** A send as it arrives: a site's, or one from DevWallet's own screens. */
export type IncomingSend = {
  rpcUrl: string
  /** The site's host, or `DEVWALLET_ORIGIN` (`~/smart/queue`). */
  origin: string
  request: RpcRequest
}

/**
 * One send per rpcUrl at a time, from its fresh reconcile to its last
 * transaction: concurrent sends race for the sponsor's funding nonce
 * ("Couldn't fund the sponsor: nonce too low"). Approvals wait outside it,
 * and previews don't need it. Joining the batch queue and signing it take
 * their turn too, so nothing joins a batch while it is being signed. Never
 * nested in `exclusive`, which the reconciles inside it use.
 */
export const oneSendAtATime = serialPerKey()

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
