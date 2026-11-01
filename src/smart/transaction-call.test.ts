import { describe, expect, test } from 'bun:test'

import { WalletRpcError } from './errors'
import {
  assertSmartSendable,
  dropsExtras,
  refusedOnSmartPath,
  withFrom,
} from './transaction-call'

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

describe('refusedOnSmartPath (R54)', () => {
  const to = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
  const authorization = {
    chainId: '0x7a69',
    address: to,
    nonce: '0x0',
    yParity: '0x0',
    r: '0x01',
    s: '0x01',
  }
  const hash = `0x01${'00'.repeat(31)}`

  test('what a smart account drops is no reason to refuse', () => {
    expect(
      refusedOnSmartPath({
        from,
        to,
        value: '0x1',
        data: '0x',
        type: '0x2',
        chainId: '0x7a69',
        accessList: [{ address: to, storageKeys: [] }],
        gas: '0x5208',
        gasPrice: '0x1',
        maxFeePerGas: '0x2',
        maxPriorityFeePerGas: '0x1',
        nonce: '0x7',
      }),
    ).toBeUndefined()
  })

  test('an empty or absent list carries nothing', () => {
    for (const empty of [undefined, null, []]) {
      expect(
        refusedOnSmartPath({ from, to, authorizationList: empty }),
      ).toBeUndefined()
      expect(
        refusedOnSmartPath({ from, to, blobVersionedHashes: empty }),
      ).toBeUndefined()
      expect(refusedOnSmartPath({ from, to, blobs: empty })).toBeUndefined()
    }
  })

  test('an authorization list or any blob field is named', () => {
    expect(
      refusedOnSmartPath({ from, to, authorizationList: [authorization] }),
    ).toBe('authorizationList')
    expect(
      refusedOnSmartPath({ from, to, blobVersionedHashes: [hash] }),
    ).toBe('blobVersionedHashes')
    expect(refusedOnSmartPath({ from, to, maxFeePerBlobGas: '0x0' })).toBe(
      'maxFeePerBlobGas',
    )
    expect(refusedOnSmartPath({ from, to, blobs: ['0x00'] })).toBe('blobs')
    // Malformed, it is still not dropped quietly.
    expect(refusedOnSmartPath({ from, to, authorizationList: '0x' })).toBe(
      'authorizationList',
    )
  })

  test('assertSmartSendable is -32602 naming the field', () => {
    expect(() => assertSmartSendable({ from, to })).not.toThrow()
    let error: unknown
    try {
      assertSmartSendable({ from, to, authorizationList: [authorization] })
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(WalletRpcError)
    expect((error as WalletRpcError).code).toBe(-32602)
    expect((error as WalletRpcError).message).toContain('`authorizationList`')
  })
})
