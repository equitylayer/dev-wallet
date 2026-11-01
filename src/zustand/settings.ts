import { useSyncExternalStoreWithTracked } from '~/hooks/useSyncExternalStoreWithTracked'
import type { SponsorSetting } from '~/smart/types'

import {
  DEFAULT_SPONSOR,
  type SettingsState,
  migrateSettingsState,
} from './settings-logic'
import { createStore } from './utils'

export type { SettingsState } from './settings-logic'

export type SettingsActions = {
  setBypassConnectAuth: (value?: boolean) => void
  setBypassSignatureAuth: (value?: boolean) => void
  setBypassTransactionAuth: (value?: boolean) => void
  setEtherscanApiKey: (value?: string) => void
  setSponsor: (value: SponsorSetting) => void
}
export type SettingsStore = SettingsState & SettingsActions

export const settingsStore = createStore<SettingsStore>(
  (set) => ({
    bypassConnectAuth: false,
    bypassSignatureAuth: false,
    bypassTransactionAuth: false,
    etherscanApiKey: '',
    sponsor: DEFAULT_SPONSOR,
    setBypassConnectAuth(value) {
      set({ bypassConnectAuth: value })
    },
    setBypassSignatureAuth(value) {
      set({ bypassSignatureAuth: value })
    },
    setBypassTransactionAuth(value) {
      set({ bypassTransactionAuth: value })
    },
    setEtherscanApiKey(value) {
      set({ etherscanApiKey: value })
    },
    setSponsor(value) {
      set({ sponsor: value })
    },
  }),
  {
    persist: {
      name: 'settings',
      version: 2,
      migrate: (persisted) => migrateSettingsState(persisted) as SettingsStore,
    },
  },
)

export const useSettingsStore = () =>
  useSyncExternalStoreWithTracked(
    settingsStore.subscribe,
    settingsStore.getState,
  )
