import { describe, expect, test } from 'bun:test'

import { asSent } from './asSent'

describe('asSent', () => {
  test('a string shows as it is', () => {
    expect(asSent('hello')).toBe('hello')
    expect(asSent('')).toBe('')
  })

  test('anything JSON holds shows as JSON', () => {
    expect(asSent({ a: 1, b: ['x'] })).toBe('{"a":1,"b":["x"]}')
    expect(asSent([1, 2, 300])).toBe('[1,2,300]')
    expect(asSent(null)).toBe('null')
    expect(asSent(12)).toBe('12')
    expect(asSent(true)).toBe('true')
  })

  test('nothing sent still shows', () => {
    expect(asSent(undefined)).toBe('undefined')
  })

  test("what JSON can't hold falls back to String, never throws", () => {
    expect(asSent(5n)).toBe('5')
    expect(asSent({ n: 5n })).toBe('[object Object]')
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(asSent(cyclic)).toBe('[object Object]')
    expect(asSent(Symbol('s'))).toBe('Symbol(s)')
  })
})
