import { describe, expect, test } from 'bun:test'

import { looksLikeHash, signNotice } from './signRequest'

const HASH = `0x${'ab'.repeat(32)}`

describe('looksLikeHash', () => {
  test('exactly 32 bytes of hex', () => {
    expect(looksLikeHash(HASH)).toBe(true)
    expect(looksLikeHash(HASH.toUpperCase().replace('0X', '0x'))).toBe(true)
  })

  test('anything else is not', () => {
    expect(looksLikeHash(`0x${'ab'.repeat(31)}`)).toBe(false)
    expect(looksLikeHash(`0x${'ab'.repeat(33)}`)).toBe(false)
    expect(looksLikeHash(`0x${'a'.repeat(63)}`)).toBe(false)
    // 64 characters of text, not hex.
    expect(looksLikeHash('ab'.repeat(32))).toBe(false)
    expect(looksLikeHash(`0x${'zz'.repeat(32)}`)).toBe(false)
    expect(looksLikeHash(undefined)).toBe(false)
  })
})

describe('signNotice', () => {
  test('a 32-byte payload warns in either method', () => {
    expect(signNotice('eth_sign', HASH)).toBe('hash')
    expect(signNotice('personal_sign', HASH)).toBe('hash')
  })

  test("eth_sign's other data: a note that it signs a prefixed message", () => {
    expect(signNotice('eth_sign', '0xdeadbeef')).toBe('prefixed')
  })

  test('a personal message says nothing more', () => {
    expect(signNotice('personal_sign', '0x68656c6c6f')).toBeNull()
    expect(signNotice('personal_sign', 'hello')).toBeNull()
  })
})
