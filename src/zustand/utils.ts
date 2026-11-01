import {
  type PersistOptions,
  type PersistStorage,
  persist,
} from 'zustand/middleware'
import {
  type Mutate,
  type StoreApi,
  createStore as create,
} from 'zustand/vanilla'

import { webextStorage } from '~/storage'

import * as stores from './index'

//////////////////////////////////////////////////////////////////
// Zustand Storages

export const persistStorage: PersistStorage<any> = {
  ...webextStorage.local,
  getItem: async (key) => {
    return (await webextStorage.local.getItem(key)) || null
  },
}

export const noopStorage: PersistStorage<any> = {
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
}

//////////////////////////////////////////////////////////////////
// Stores

type Initializer<TState> = Parameters<typeof persist<TState>>[0]
export type StoreWithPersist<TState> = Mutate<
  StoreApi<TState>,
  [['zustand/persist', unknown]]
> & {
  initializer: Initializer<TState>
}

export function createStore<TState>(
  initializer: Initializer<TState>,
  { persist: persistOptions }: { persist?: PersistOptions<TState> } = {},
) {
  const name = `zustand.${persistOptions?.name}`
  return Object.assign(
    create(
      persist(initializer, {
        ...persistOptions,
        name,
        storage: persistOptions ? persistStorage : noopStorage,
      }),
    ),
    { initializer },
  )
}

async function syncStore({ store }: { store: StoreWithPersist<unknown> }) {
  if (!store.persist) return

  const persistOptions = store.persist.getOptions()
  const storageName = persistOptions.name || ''

  const listener = async (changedStore: StoreWithPersist<unknown>) => {
    if (changedStore === undefined) {
      // Retrieve the default state from the store initializer.
      const state = store.initializer(
        (x) => x,
        () => null,
        {} as any,
      )
      const version = persistOptions.version
      await persistOptions.storage?.setItem(storageName, { state, version })
    }
    store.persist.rehydrate()
  }

  webextStorage.local.subscribe(storageName, listener)
}

/**
 * Reloads each persisted store whenever another context writes it. `except`
 * lists the stores this context alone writes: its memory is the truth, and a
 * reload that one of its own writes set off could land after a later write
 * and undo it.
 */
export function syncStores({
  except = [],
}: { except?: readonly object[] } = {}) {
  Object.values(stores).forEach((store) => {
    if (except.includes(store)) return
    if ('persist' in store && (store as StoreWithPersist<unknown>).persist)
      syncStore({ store: store as StoreWithPersist<unknown> })
  })
}

export function getKey(args: string[]): string {
  return args.join('-').replace(/\./g, '-')
}
