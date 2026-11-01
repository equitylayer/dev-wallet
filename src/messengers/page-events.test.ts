import { describe, expect, test } from 'bun:test'
import type { Address } from 'viem'

import {
  accountsChangedEvent,
  chainChangedEvent,
  connectEvent,
  disconnectEvent,
  pageEventFor,
} from './page-events'

const accounts = [
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
] as Address[]
const sessions = [{ host: 'dapp.test' }, { host: 'other.test' }]

describe('accountsChanged', () => {
  const event = accountsChangedEvent(accounts, sessions)

  test('a connected page gets the accounts, and nothing else', () => {
    expect(pageEventFor(event, 'dapp.test')).toEqual({
      topic: 'accountsChanged',
      payload: { accounts },
    })
  })

  test('never the list of connected sites', () => {
    const forPage = JSON.stringify(pageEventFor(event, 'dapp.test'))
    expect(forPage).not.toContain('other.test')
    expect(forPage).not.toContain('sessions')
    expect(forPage).not.toContain('hosts')
  })

  test('a page that is not connected gets nothing', () => {
    expect(pageEventFor(event, 'evil.test')).toBeUndefined()
  })

  test('a www. page is its bare host', () => {
    expect(pageEventFor(event, 'www.dapp.test')).toEqual({
      topic: 'accountsChanged',
      payload: { accounts },
    })
    expect(
      pageEventFor(accountsChangedEvent(accounts, [{ host: 'www.a.test' }]), 'a.test'),
    ).toBeDefined()
  })

  test('with no sessions, nobody', () => {
    expect(
      pageEventFor(accountsChangedEvent(accounts, []), 'dapp.test'),
    ).toBeUndefined()
  })
})

describe('chainChanged', () => {
  const event = chainChangedEvent('0x7a69', sessions)

  test('connected pages get the chain id alone', () => {
    expect(pageEventFor(event, 'other.test')).toEqual({
      topic: 'chainChanged',
      payload: { chainId: '0x7a69' },
    })
    expect(pageEventFor(event, 'evil.test')).toBeUndefined()
  })
})

describe('connect and disconnect', () => {
  test('go to the site connected or disconnected, and no other', () => {
    const connect = connectEvent('www.dapp.test', '0x7a69')
    expect(pageEventFor(connect, 'dapp.test')).toEqual({
      topic: 'connect',
      payload: { chainId: '0x7a69' },
    })
    expect(pageEventFor(connect, 'other.test')).toBeUndefined()

    const disconnect = disconnectEvent('dapp.test')
    expect(pageEventFor(disconnect, 'dapp.test')).toEqual({
      topic: 'disconnect',
      payload: undefined,
    })
    expect(pageEventFor(disconnect, 'other.test')).toBeUndefined()
  })
})

describe('pageEventFor', () => {
  test.each([
    undefined,
    null,
    'accountsChanged',
    { topic: 'accountsChanged', payload: { accounts } },
    { topic: 'accountsChanged', payload: { accounts }, hosts: 'dapp.test' },
    { topic: 'pendingRequest', payload: {}, hosts: ['dapp.test'] },
    { topic: 'toString', payload: {}, hosts: ['dapp.test'] },
  ])('%p is not an event for any page', (event) => {
    expect(pageEventFor(event, 'dapp.test')).toBeUndefined()
  })
})
