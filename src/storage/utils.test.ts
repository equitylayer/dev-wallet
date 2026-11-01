import { describe, expect, test } from 'bun:test'

import { replacer, reviver } from './utils'

const roundTrip = (value: unknown) =>
  JSON.parse(JSON.stringify(value, replacer), reviver)

describe('bigints the wallet stores', () => {
  test.each([0n, 1n, -5n, 2n ** 255n, -(2n ** 200n)])('%p round-trips', (n) => {
    expect(roundTrip({ n })).toEqual({ n })
  })

  test('inside the shapes the stores persist', () => {
    // The network store's fork block and the contracts store's scan cursor.
    const state = {
      network: { forkBlockNumber: 19_000_000n, rpcUrl: 'http://127.0.0.1:8545' },
      cursor: { fromBlock: 0n, blockNumber: 12n, blockHash: '0xabc' },
    }
    expect(roundTrip({ state, version: 0 })).toEqual({ state, version: 0 })
  })
})

describe('strings a site sent stay strings', () => {
  test.each([
    '#bigint.5',
    '#bigint.zz',
    '#bigint.',
    '#bigint.-',
    '#bigint.1e3',
    '#bigint. 5',
    '#',
    '##',
    '##bigint.5',
    '###bigint.5',
    '#fff',
    'bigint.5',
    '',
  ])('%p round-trips as itself', (text) => {
    expect(roundTrip({ text })).toEqual({ text })
  })

  test('in a pending request, the typed data shows what the site sent', () => {
    const request = {
      id: 1,
      method: 'eth_signTypedData_v4',
      params: [
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        {
          types: { Mail: [{ name: 'note', type: 'string' }] },
          primaryType: 'Mail',
          message: { note: '#bigint.5', other: '#bigint.zz' },
        },
      ],
      sender: { url: 'https://evil.test/', origin: 'https://evil.test' },
    }
    const pendingRequests = [request]
    expect(roundTrip({ state: { pendingRequests }, version: 0 })).toEqual({
      state: { pendingRequests },
      version: 0,
    })
  })

  test('keys are never touched', () => {
    expect(roundTrip({ '#bigint.5': 1, '##x': 2 })).toEqual({
      '#bigint.5': 1,
      '##x': 2,
    })
  })
})

describe('what an earlier version stored', () => {
  test('its bigints still revive', () => {
    expect(JSON.parse('{"n":"#bigint.42","m":"#bigint.-7"}', reviver)).toEqual({
      n: 42n,
      m: -7n,
    })
  })

  test('a tag that is not a number never throws', () => {
    expect(JSON.parse('{"text":"#bigint.zz"}', reviver)).toEqual({
      text: '#bigint.zz',
    })
  })

  test('a plain string that starts with one # is read as it was', () => {
    expect(JSON.parse('{"text":"#fff"}', reviver)).toEqual({ text: '#fff' })
  })
})
