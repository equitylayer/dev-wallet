import { useSyncExternalStoreWithTracked } from '~/hooks/useSyncExternalStoreWithTracked'
import { createStore } from './utils'

export type SettingsState = {
  bypassConnectAuth?: boolean
  bypassSignatureAuth?: boolean
  bypassTransactionAuth?: boolean
  etherscanApiKey?: string
}
export type SettingsActions = {
  setBypassConnectAuth: (value?: boolean) => void
  setBypassSignatureAuth: (value?: boolean) => void
  setBypassTransactionAuth: (value?: boolean) => void
  setEtherscanApiKey: (value?: string) => void
}
export type SettingsStore = SettingsState & SettingsActions

export const settingsStore = createStore<SettingsStore>(
  (set) => ({
    bypassConnectAuth: false,
    bypassSignatureAuth: false,
    bypassTransactionAuth: false,
    etherscanApiKey: '',
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
  }),
  {
    persist: {
      name: 'settings',
      version: 1,
    },
  },
)

export const useSettingsStore = () =>
  useSyncExternalStoreWithTracked(
    settingsStore.subscribe,
    settingsStore.getState,
  )
