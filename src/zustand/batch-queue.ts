import { useSyncExternalStore } from 'react'

import type { BatchQueue } from '~/smart/queue'

import { createStore } from './utils'

export type BatchQueueState = {
  queue: BatchQueue | null
}
export type BatchQueueStore = BatchQueueState

/**
 * The open batch (spec §7). The background is its only writer, so it has no
 * actions: the wallet UI reads it, and changes it with `batchQueue` messages.
 * The background never reloads it from storage after startup (`syncStores`).
 */
export const batchQueueStore = createStore<BatchQueueStore>(
  () => ({ queue: null }),
  {
    persist: {
      name: 'batch-queue',
      version: 0,
    },
  },
)

/**
 * The open batch, or `null`. Not the tracked store hook: it can't take a
 * `null` field (it reads one as an object).
 */
export const useBatchQueue = (): BatchQueue | null =>
  useSyncExternalStore(
    batchQueueStore.subscribe,
    () => batchQueueStore.getState().queue,
  )
