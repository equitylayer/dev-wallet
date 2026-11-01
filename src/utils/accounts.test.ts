import { describe, expect, test } from 'bun:test'
import { type Address, getAddress } from 'viem'

import { filterAccounts, sameAddresses } from './accounts'

const rpcA = 'http://127.0.0.1:8545'
const rpcB = 'http://127.0.0.1:8546'

const a1 = getAddress('0x00000000000000000000000000000000000000a1')
const a2 = getAddress('0x00000000000000000000000000000000000000a2')
const b1 = getAddress('0x00000000000000000000000000000000000000b1')
const local = getAddress('0x00000000000000000000000000000000000000c1')

type TestAccount = { address: Address; rpcUrl?: string; displayName?: string }

const accountA1: TestAccount = { address: a1, rpcUrl: rpcA }
const accountA2: TestAccount = { address: a2, rpcUrl: rpcA }
const accountB1: TestAccount = { address: b1, rpcUrl: rpcB }
const accountLocal: TestAccount = { address: local }

describe('filterAccounts', () => {
  test('keeps local accounts and those on the given rpcUrl, in order', () => {
    const accounts = [accountB1, accountA1, accountLocal, accountA2]
    expect(filterAccounts({ accounts, rpcUrl: rpcA })).toEqual([
      accountA1,
      accountLocal,
      accountA2,
    ])
  })

  test('only keeps local accounts without an rpcUrl', () => {
    expect(
      filterAccounts({ accounts: [accountA1, accountLocal, accountB1] }),
    ).toEqual([accountLocal])
  })

  test('activeFirst returns only rpcA accounts, active first (eth_accounts leak)', () => {
    const accounts = [accountB1, accountA2, accountA1]
    expect(
      filterAccounts({
        account: accountA1,
        accounts,
        activeFirst: true,
        rpcUrl: rpcA,
      }),
    ).toEqual([accountA1, accountA2])
  })

  test('activeFirst does not repeat the active account', () => {
    const accounts = [accountA2, accountA1, accountLocal]
    const result = filterAccounts({
      account: accountA1,
      accounts,
      activeFirst: true,
      rpcUrl: rpcA,
    })
    expect(result).toEqual([accountA1, accountA2, accountLocal])
  })

  test('activeFirst matches the active account by lowercase address', () => {
    const active: TestAccount = { address: a1, rpcUrl: rpcA }
    const listed: TestAccount = {
      address: a1.toLowerCase() as Address,
      rpcUrl: rpcA,
    }
    expect(
      filterAccounts({
        account: active,
        accounts: [accountA2, listed],
        activeFirst: true,
        rpcUrl: rpcA,
      }),
    ).toEqual([active, accountA2])
  })

  test('activeFirst drops an active account on another network', () => {
    const accounts = [accountB1, accountA1, accountA2]
    expect(
      filterAccounts({
        account: accountB1,
        accounts,
        activeFirst: true,
        rpcUrl: rpcA,
      }),
    ).toEqual([accountA1, accountA2])
  })

  test('activeFirst keeps an active local account', () => {
    expect(
      filterAccounts({
        account: accountLocal,
        accounts: [accountA1, accountLocal],
        activeFirst: true,
        rpcUrl: rpcA,
      }),
    ).toEqual([accountLocal, accountA1])
  })

  test('activeFirst without an active account keeps the filtered order', () => {
    expect(
      filterAccounts({
        accounts: [accountB1, accountA2, accountA1],
        activeFirst: true,
        rpcUrl: rpcA,
      }),
    ).toEqual([accountA2, accountA1])
  })

  test('ignores the active account when activeFirst is not set', () => {
    expect(
      filterAccounts({
        account: accountA2,
        accounts: [accountA1, accountA2],
        rpcUrl: rpcA,
      }),
    ).toEqual([accountA1, accountA2])
  })
})

describe('sameAddresses', () => {
  test('is true for the same addresses with different other fields', () => {
    const before: TestAccount[] = [
      { address: a1, displayName: 'one' },
      { address: a2, displayName: 'two' },
    ]
    const after: TestAccount[] = [
      { address: a1, displayName: 'uno' },
      { address: a2 },
    ]
    expect(sameAddresses(before, after)).toBe(true)
  })

  test('is false for a different order', () => {
    expect(
      sameAddresses(
        [{ address: a1 }, { address: a2 }],
        [{ address: a2 }, { address: a1 }],
      ),
    ).toBe(false)
  })

  test('is false for a different length', () => {
    expect(sameAddresses([{ address: a1 }], [])).toBe(false)
    expect(sameAddresses([], [{ address: a1 }])).toBe(false)
  })

  test('is true for two empty lists', () => {
    expect(sameAddresses([], [])).toBe(true)
  })

  test('compares addresses case-insensitively', () => {
    expect(
      sameAddresses(
        [{ address: a1 }],
        [{ address: a1.toLowerCase() as Address }],
      ),
    ).toBe(true)
  })
})
