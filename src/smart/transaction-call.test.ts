import { describe, expect, test } from 'bun:test'

import { WalletRpcError } from './errors'
import { dropsExtras, withFrom } from './transaction-call'

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

describe('withFrom', () => {
  const active = '0x90F79bf6EB2c4f870365E785982E1f101E93b906'
  const to = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'

  test('no `from` gets the account', () => {
    expect(withFrom({ to, value: '0x1' }, active)).toEqual({
      to,
      value: '0x1',
      from: active,
    })
    expect(withFrom({ from: undefined, to }, active)).toEqual({
      from: active,
      to,
    })
    expect(withFrom({ from: null, to }, active)).toEqual({ from: active, to })
  })

  test('a string `from` is kept, as it is', () => {
    const tx = { from, to }
    expect(withFrom(tx, active)).toBe(tx)
  })

  // An array row is spread as the arguments: wrap the array cases.
  test.each([1, 0, true, {}, [[from]]])(
    'a `from` of %p is invalid params',
    (bad) => {
      const call = () => withFrom({ from: bad, to }, active)
      expect(call).toThrow(WalletRpcError)
      expect(call).toThrow(expect.objectContaining({ code: -32602 }))
    },
  )

  test.each([undefined, null, '0x', [[{ to }]]])(
    'a transaction of %p is invalid params',
    (bad) => {
      expect(() => withFrom(bad, active)).toThrow(
        expect.objectContaining({ code: -32602 }),
      )
    },
  )
})
