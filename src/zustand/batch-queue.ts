import type { Address } from 'viem'

import { useSyncExternalStoreWithTracked } from '~/hooks/useSyncExternalStoreWithTracked'
import {
  type BatchQueue,
  type QueuedItem,
  enqueue,
  moveItem,
  openQueue,
  removeItem,
} from '~/smart/queue'

import { createStore } from './utils'

export type BatchQueueState = {
  queue: BatchQueue | null
}
export type BatchQueueActions = {
  /** Opens an empty batch ("Start batch"); an open one stays as it is. */
  openQueue(args: { rpcUrl: string; account: Address }): void
  enqueue(item: QueuedItem): void
  /** Moves the item at `from` to `to` (a `wallet_sendCalls` moves whole). */
  moveItem(from: number, to: number): void
  removeItem(requestId: number): void
  clearQueue(): void
}
export type BatchQueueStore = BatchQueueState & BatchQueueActions

// Both the background and the side panel write this store, and each
// rehydrates on every write, its own included. A rehydrate started before a
// write lands after it and briefly undoes it; the background would take the
// vanished items for removals and reject their requests. Rehydrating right
// after each write supersedes any rehydrate already under way.
export const batchQueueStore = createStore<BatchQueueStore>(
  (set, _get, api) => {
    const update = (edit: (queue: BatchQueue | null) => BatchQueue | null) => {
      set((state) => ({ queue: edit(state.queue) }))
      void api.persist.rehydrate()
    }
    return {
      queue: null,

      openQueue(args) {
        update((queue) => openQueue(queue, args, Date.now()))
      },
      enqueue(item) {
        update((queue) => enqueue(queue, item))
      },
      moveItem(from, to) {
        update((queue) => moveItem(queue, from, to))
      },
      removeItem(requestId) {
        update((queue) => removeItem(queue, requestId))
      },
      clearQueue() {
        update(() => null)
      },
    }
  },
  {
    persist: {
      name: 'batch-queue',
      version: 0,
    },
  },
)

export const useBatchQueueStore = () =>
  useSyncExternalStoreWithTracked(
    batchQueueStore.subscribe,
    batchQueueStore.getState,
  )
