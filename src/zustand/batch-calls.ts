import { useSyncExternalStoreWithTracked } from '~/hooks/useSyncExternalStoreWithTracked'
import {
  type BatchRecord,
  type BatchRecordsState,
  clearRecords,
  getRecord,
  pruneRecords,
  putRecord,
} from '~/smart/batch-records'

import { createStore } from './utils'

export type BatchCallsState = BatchRecordsState
export type BatchCallsActions = {
  clearRecords(rpcUrl: string): void
  getRecord(rpcUrl: string, id: string): BatchRecord | undefined
  /** Stores a record, then forgets the network's oldest ones. */
  putRecord(record: BatchRecord): void
}
export type BatchCallsStore = BatchCallsState & BatchCallsActions

export const batchCallsStore = createStore<BatchCallsStore>(
  (set, get) => ({
    records: {},

    clearRecords(rpcUrl) {
      set((state) => clearRecords(state, rpcUrl))
    },
    getRecord(rpcUrl, id) {
      return getRecord(get(), rpcUrl, id)
    },
    putRecord(record) {
      set((state) => pruneRecords(putRecord(state, record), record.rpcUrl))
    },
  }),
  {
    persist: {
      name: 'batch-calls',
      version: 1,
      migrate,
    },
  },
)

export const useBatchCallsStore = () =>
  useSyncExternalStoreWithTracked(
    batchCallsStore.subscribe,
    batchCallsStore.getState,
  )

///////////////////////////////////////////////////////////////////////////////////////
// Migrations

// v0 kept batches by id with no network and no call details to rely on, so
// there is nothing worth carrying over.
function migrate(): BatchCallsStore {
  return { records: {} } as BatchCallsStore
}
