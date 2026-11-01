import type { Address, Hash, Hex } from 'viem'

import type { ExecutionPath } from './execute'
import type { RpcCall } from './types'

/**
 * What a `wallet_sendCalls` batch left behind, so `wallet_getCallsStatus` can
 * find it later. It is persisted, so it holds only strings and numbers.
 */
export type BatchRecord = {
  id: string
  rpcUrl: string
  chainId: number
  from: Address
  calls: RpcCall[]
  path: ExecutionPath
  /** One hash, except `sequential`, which has one per call. */
  transactionHashes: Hash[]
  /** Only for `userop`. */
  userOpHash?: Hex
  createdAt: number
}

/** The records of one network, as `handleWalletRequest` sees them. */
export interface BatchRecords {
  get(id: string): BatchRecord | undefined
  put(record: BatchRecord): void
}

/** Records per network (`rpcUrl`), then per batch id. */
export type BatchRecordsState = {
  records: Record<string, Record<string, BatchRecord>>
}

export function getRecord(
  state: BatchRecordsState,
  rpcUrl: string,
  id: string,
): BatchRecord | undefined {
  return state.records[rpcUrl]?.[id]
}

export function putRecord(
  state: BatchRecordsState,
  record: BatchRecord,
): BatchRecordsState {
  const { rpcUrl, id } = record
  return {
    records: {
      ...state.records,
      [rpcUrl]: { ...state.records[rpcUrl], [id]: record },
    },
  }
}

/** Drops all but the newest `keep` records (by `createdAt`) of one network. */
export function pruneRecords(
  state: BatchRecordsState,
  rpcUrl: string,
  keep = 200,
): BatchRecordsState {
  const forNetwork = state.records[rpcUrl]
  if (!forNetwork || Object.keys(forNetwork).length <= keep) return state

  const newest = Object.values(forNetwork)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, keep)
  return {
    records: {
      ...state.records,
      [rpcUrl]: Object.fromEntries(newest.map((r) => [r.id, r])),
    },
  }
}

/** Drops every record of one network. */
export function clearRecords(
  state: BatchRecordsState,
  rpcUrl: string,
): BatchRecordsState {
  const { [rpcUrl]: _, ...records } = state.records
  return { records }
}

/**
 * The batches that carry a transaction, newest first. Several can share one
 * transaction, so callers that want one take the first.
 */
export function recordsForTransaction(
  state: BatchRecordsState,
  rpcUrl: string,
  hash: Hex,
): BatchRecord[] {
  const wanted = hash.toLowerCase()
  return Object.values(state.records[rpcUrl] ?? {})
    .filter((r) =>
      r.transactionHashes.some((h) => h.toLowerCase() === wanted),
    )
    .sort((a, b) => b.createdAt - a.createdAt)
}
