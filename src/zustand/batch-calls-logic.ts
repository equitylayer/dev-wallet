// Pure batch-calls store logic. Kept free of chrome/zustand imports so
// `bun test` can load it; the store in ./batch-calls.ts calls into these.
import type { BatchRecordsState } from '~/smart/batch-records'

/**
 * The persisted batch records, migrated to v1. v0 kept batches by id with no
 * network and no call details to rely on, so there is nothing worth carrying
 * over.
 */
export function migrateBatchCallsState(_persisted: unknown): BatchRecordsState {
  return { records: {} }
}
