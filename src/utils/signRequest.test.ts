import { describe, expect, test } from 'bun:test'

import {
  canonicalParams,
  looksLikeHash,
  payloadBytes,
  readableText,
  signNotice,
} from './signRequest'

const ACCOUNT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const H = 'ab'.repeat(32)
const HASH = `0x${H}` as const

// What anvil 1.7.1 does with each (probed): optional lowercase `0x`, then
// even-length hex in any case; anything else it refuses.
describe('payloadBytes: the bytes the node signs', () => {
  test('hex with or without 0x, in any case, as 0x-prefixed lowercase', () => {
    expect(payloadBytes(HASH)).toBe(HASH)
    expect(payloadBytes(H)).toBe(HASH)
    expect(payloadBytes(`0x${H.toUpperCase()}`)).toBe(HASH)
    expect(payloadBytes('deadbeef')).toBe('0xdeadbeef')
    expect(payloadBytes('')).toBe('0x')
    expect(payloadBytes('0x')).toBe('0x')
  })

  test('what the node refuses: odd length, 0X, non-hex, plain text', () => {
    expect(payloadBytes(`0x${'a'.repeat(63)}`)).toBeNull()
    expect(payloadBytes('a'.repeat(63))).toBeNull()
    expect(payloadBytes(`0X${H}`)).toBeNull()
    expect(payloadBytes('0xzz')).toBeNull()
    expect(payloadBytes('hello')).toBeNull()
    expect(payloadBytes(undefined)).toBeNull()
  })
})

describe('looksLikeHash', () => {
  test('32 bytes as the node decodes them', () => {
    expect(looksLikeHash(HASH)).toBe(true)
    expect(looksLikeHash(H)).toBe(true)
    expect(looksLikeHash(`0x${H.toUpperCase()}`)).toBe(true)
    expect(looksLikeHash(`0x${'ab'.repeat(31)}`)).toBe(false)
    expect(looksLikeHash(`0x${'ab'.repeat(33)}`)).toBe(false)
    expect(looksLikeHash(`0x${'a'.repeat(63)}`)).toBe(false)
  })
})

describe('signNotice', () => {
  test('a 32-byte payload warns in either method, with or without 0x', () => {
    for (const data of [HASH, H, `0x${H.toUpperCase()}`, H.toUpperCase()]) {
      expect(signNotice('eth_sign', data)).toBe('hash')
      expect(signNotice('personal_sign', data)).toBe('hash')
    }
  })

  test("eth_sign's other data: a note that it signs a prefixed message", () => {
    expect(signNotice('eth_sign', '0xdeadbeef')).toBe('prefixed')
    expect(signNotice('eth_sign', 'deadbeef')).toBe('prefixed')
  })

  test('a personal message says nothing more', () => {
    expect(signNotice('personal_sign', '0x68656c6c6f')).toBeNull()
  })

  test('what the node refuses says so, in either method', () => {
    expect(signNotice('personal_sign', 'hello')).toBe('refused')
    expect(signNotice('personal_sign', `0x${'a'.repeat(63)}`)).toBe('refused')
    expect(signNotice('eth_sign', 'a'.repeat(63))).toBe('refused')
  })
})

describe('readableText', () => {
  test('the bytes as text, when they are plain UTF-8', () => {
    expect(readableText('0x68656c6c6f')).toBe('hello')
    expect(readableText('0x6c696e6520310a6c696e652032')).toBe('line 1\nline 2')
    expect(readableText('0xe282ac')).toBe('€')
  })

  test('null for bytes that are not, or that hide characters', () => {
    expect(readableText('0xdeadbeef')).toBeNull()
    // A right-to-left override, and a byte order mark.
    expect(readableText('0x61e280ae62')).toBeNull()
    expect(readableText('0xefbbbf6869')).toBeNull()
    expect(readableText('0x0068')).toBeNull()
  })
})

describe('canonicalParams: what the decision forwards', () => {
  test('the payload as the 0x-prefixed bytes the screen shows', () => {
    expect(canonicalParams('eth_sign', [ACCOUNT, H])).toEqual([ACCOUNT, HASH])
    expect(canonicalParams('personal_sign', [H.toUpperCase(), ACCOUNT])).toEqual([
      HASH,
      ACCOUNT,
    ])
  })

  test('the same params when already canonical, or refused by the node', () => {
    const params = [HASH, ACCOUNT]
    expect(canonicalParams('personal_sign', params)).toBe(params)
    const text = ['hello', ACCOUNT]
    expect(canonicalParams('personal_sign', text)).toBe(text)
  })
})
