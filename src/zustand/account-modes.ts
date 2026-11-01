import type { Address } from 'viem'

import { useSyncExternalStoreWithTracked } from '~/hooks/useSyncExternalStoreWithTracked'
import type { AccountMode } from '~/smart/types'

import { createStore } from './utils'

/** Key of an account's mode: one per address per network. */
export function modeKey(rpcUrl: string, address: Address): string {
  return `${rpcUrl}.${address.toLowerCase()}`
}

export type AccountModesState = {
  modes: Record<string, AccountMode>
}
export type AccountModesActions = {
  clearMode(args: { rpcUrl: string; address: Address }): void
  getMode(args: { rpcUrl: string; address: Address }): AccountMode | undefined
  setMode(args: {
    rpcUrl: string
    address: Address
    mode: AccountMode
  }): void
}
export type AccountModesStore = AccountModesState & AccountModesActions

export const accountModesStore = createStore<AccountModesStore>(
  (set, get) => ({
    modes: {},

    clearMode({ rpcUrl, address }) {
      set((state) => {
        const { [modeKey(rpcUrl, address)]: _, ...modes } = state.modes
        return { modes }
      })
    },
    getMode({ rpcUrl, address }) {
      return get().modes[modeKey(rpcUrl, address)]
    },
    setMode({ rpcUrl, address, mode }) {
      set((state) => ({
        modes: { ...state.modes, [modeKey(rpcUrl, address)]: mode },
      }))
    },
  }),
  {
    persist: {
      name: 'account-modes',
      version: 0,
    },
  },
)

export const useAccountModesStore = () =>
  useSyncExternalStoreWithTracked(
    accountModesStore.subscribe,
    accountModesStore.getState,
  )
