// Pure settings logic. Kept free of chrome/zustand imports so `bun test` can
// load it; the settings store in ./settings.ts calls into these.
import type { SponsorSetting } from '~/smart/types'

export type SettingsState = {
  bypassConnectAuth?: boolean
  bypassSignatureAuth?: boolean
  bypassTransactionAuth?: boolean
  etherscanApiKey?: string
  /** Who pays the gas of smart accounts' user operations. */
  sponsor: SponsorSetting
}

export const DEFAULT_SPONSOR: SponsorSetting = { kind: 'devwallet' }

/**
 * The persisted settings, migrated to v2. v2 adds the gas sponsor (DevWallet
 * by default); everything stored before keeps its value.
 */
export function migrateSettingsState(persisted: unknown): SettingsState {
  const state = (persisted ?? {}) as Partial<SettingsState>
  const sponsor = state.sponsor ?? DEFAULT_SPONSOR
  return { ...state, sponsor }
}
