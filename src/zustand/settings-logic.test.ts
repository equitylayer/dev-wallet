import { describe, expect, test } from 'bun:test'

import type { SponsorSetting } from '~/smart/types'

import { migrateSettingsState } from './settings-logic'

describe('migrateSettingsState', () => {
  test('v1 -> v2: adds the DevWallet sponsor, and keeps everything else', () => {
    const v1 = {
      bypassConnectAuth: true,
      bypassSignatureAuth: false,
      bypassTransactionAuth: true,
      etherscanApiKey: 'KEY',
    }
    expect(migrateSettingsState(v1)).toEqual({
      ...v1,
      sponsor: { kind: 'devwallet' },
    })
  })

  test('a stored sponsor is kept', () => {
    const sponsor: SponsorSetting = {
      kind: 'account',
      address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    }
    expect(migrateSettingsState({ etherscanApiKey: '', sponsor })).toEqual({
      etherscanApiKey: '',
      sponsor,
    })
    expect(migrateSettingsState({ sponsor: { kind: 'off' } })).toEqual({
      sponsor: { kind: 'off' },
    })
  })

  test('nothing stored gets the defaults', () => {
    expect(migrateSettingsState(undefined)).toEqual({
      sponsor: { kind: 'devwallet' },
    })
    expect(migrateSettingsState(null)).toEqual({
      sponsor: { kind: 'devwallet' },
    })
  })
})
