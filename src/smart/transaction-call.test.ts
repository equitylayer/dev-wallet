import { describe, expect, test } from 'bun:test'

import { dropsExtras } from './transaction-call'

const from = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

describe('dropsExtras', () => {
  test("a smart account's transaction goes through the core: its other fields drop", () => {
    expect(dropsExtras({ from, to: from }, 'smart')).toBe(true)
  })

  test('a plain account, or one the wallet does not know, sends it whole', () => {
    expect(dropsExtras({ from }, 'plain-upgradable')).toBe(false)
    expect(dropsExtras({ from }, 'plain-never')).toBe(false)
    expect(dropsExtras({ from }, undefined)).toBe(false)
  })

  test('without a string `from`, it goes to the node whole, whatever the mode', () => {
    expect(dropsExtras({ to: from }, 'smart')).toBe(false)
    expect(dropsExtras({ from: undefined }, 'smart')).toBe(false)
    expect(dropsExtras({ from: 1 }, 'smart')).toBe(false)
    expect(dropsExtras({ from: null }, 'smart')).toBe(false)
  })
})
