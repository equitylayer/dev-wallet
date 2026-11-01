import { expect, test } from 'bun:test'

import { toCall, toRpcCall } from './types'

const to = '0x000000000000000000000000000000000000c0de'

test('toCall parses the hex value to a bigint', () => {
  expect(toCall({ to, value: '0xde0b6b3a7640000', data: '0x1234' })).toEqual({
    to,
    value: 10n ** 18n,
    data: '0x1234',
  })
})

test('toRpcCall encodes the value as a hex quantity', () => {
  expect(toRpcCall({ to, value: 10n ** 18n, data: '0x1234' })).toEqual({
    to,
    value: '0xde0b6b3a7640000',
    data: '0x1234',
  })
  expect(toRpcCall({ to, value: 0n }).value).toBe('0x0')
})

test('absent fields stay absent in both directions', () => {
  expect(toCall({ data: '0x' })).toStrictEqual({ data: '0x' })
  expect(toRpcCall({ to })).toStrictEqual({ to })
})
