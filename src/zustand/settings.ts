import { useSyncExternalStoreWithTracked } from '~/hooks/useSyncExternalStoreWithTracked'
import type { SponsorSetting } from '~/smart/types'

import { createStore } from './utils'

export type SettingsState = {
  bypassConnectAuth?: boolean
  bypassSignatureAuth?: boolean
  bypassTransactionAuth?: boolean
  etherscanApiKey?: string
  /** Who pays the gas of smart accounts' user operations. */
  sponsor: SponsorSetting
}
export type SettingsActions = {
  setBypassConnectAuth: (value?: boolean) => void
  setBypassSignatureAuth: (value?: boolean) => void
  setBypassTransactionAuth: (value?: boolean) => void
  setEtherscanApiKey: (value?: string) => void
  setSponsor: (value: SponsorSetting) => void
}
export type SettingsStore = SettingsState & SettingsActions

const DEFAULT_SPONSOR: SponsorSetting = { kind: 'devwallet' }

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
      migrate,
    },
  },
)

export const useSettingsStore = () =>
  useSyncExternalStoreWithTracked(
    settingsStore.subscribe,
    settingsStore.getState,
  )

///////////////////////////////////////////////////////////////////////////////////////
// Migrations

// v2 adds the gas sponsor; everything stored before keeps its value.
function migrate(persisted: unknown): SettingsStore {
  const state = (persisted ?? {}) as Partial<SettingsState>
  const sponsor = state.sponsor ?? DEFAULT_SPONSOR
  return { ...state, sponsor } as SettingsStore
}
