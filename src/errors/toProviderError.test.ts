import { expect, test } from 'bun:test'

import { WalletRpcError, serializeError } from '~/smart/errors'

import {
  ProviderRpcError,
  UnauthorizedProviderError,
  UnsupportedProviderMethodError,
  UserRejectedRequestError,
  toProviderError,
} from './rpc'

test('keeps the code and revert data of a predicted revert', () => {
  const error = toProviderError({
    code: 3,
    message: 'execution reverted',
    data: '0x08c379a0',
  }) as ProviderRpcError
  expect(error).toBeInstanceOf(ProviderRpcError)
  expect(error.code).toBe(3)
  expect(error.data).toBe('0x08c379a0')
  expect(error.message).toBe('execution reverted')
})

test('keeps EIP-5792 codes', () => {
  for (const code of [5700, 5710, 5720, 5730, 5750, 5760]) {
    const error = toProviderError({ code, message: 'x' }) as ProviderRpcError
    expect(error.code).toBe(code)
    expect(error.message).toBe('x')
    expect(error.data).toBeUndefined()
  }
})

test('keeps structured data untouched', () => {
  const data = { failedAt: 1, reason: ['a', 'b'] }
  const error = toProviderError({
    code: 5700,
    message: 'x',
    data,
  }) as ProviderRpcError
  expect(error.data).toBe(data)
})

test('maps 4001, 4100 and 4200 to their classes', () => {
  expect(toProviderError({ code: 4001, message: 'x' })).toBeInstanceOf(
    UserRejectedRequestError,
  )
  expect(toProviderError({ code: 4100, message: 'x' })).toBeInstanceOf(
    UnauthorizedProviderError,
  )
  expect(toProviderError({ code: 4200, message: 'x' })).toBeInstanceOf(
    UnsupportedProviderMethodError,
  )
})

test('the EIP-1193 classes keep their code and data', () => {
  const rejected = toProviderError({
    code: 4001,
    message: 'x',
    data: { request: { method: 'eth_sendTransaction', params: [{}], id: 1 } },
  }) as UserRejectedRequestError
  expect(rejected.code).toBe(4001)
  expect(rejected.request).toEqual({ method: 'eth_sendTransaction', params: [{}], id: 1 })
  expect(rejected.data).toEqual({
    request: { method: 'eth_sendTransaction', params: [{}], id: 1 },
  })

  const unauthorized = toProviderError({
    code: 4100,
    message: 'x',
    data: 'd',
  }) as UnauthorizedProviderError
  expect(unauthorized.code).toBe(4100)
  expect(unauthorized.data).toBe('d')

  const unsupported = toProviderError({
    code: 4200,
    message: 'x',
    data: 'd',
  }) as UnsupportedProviderMethodError
  expect(unsupported.code).toBe(4200)
  expect(unsupported.data).toBe('d')
})

test('4001 with non-object data does not throw', () => {
  expect(
    toProviderError({ code: 4001, message: 'x', data: null }),
  ).toBeInstanceOf(UserRejectedRequestError)
  expect(
    toProviderError({ code: 4001, message: 'x', data: 'text' }),
  ).toBeInstanceOf(UserRejectedRequestError)
})

test('serializeError keeps the code of a WalletRpcError', () => {
  expect(serializeError(new WalletRpcError(5760, 'no'))).toStrictEqual({
    code: 5760,
    message: 'no',
  })
})

test('serializeError maps plain errors to -32603', () => {
  expect(serializeError(new Error('boom'))).toStrictEqual({
    code: -32603,
    message: 'boom',
  })
})

test('a serialized WalletRpcError round-trips through toProviderError', () => {
  const error = toProviderError(
    serializeError(new WalletRpcError(3, 'execution reverted', '0x08c379a0')),
  ) as ProviderRpcError
  expect(error.code).toBe(3)
  expect(error.data).toBe('0x08c379a0')
  expect(error.message).toBe('execution reverted')

  const noData = toProviderError(
    serializeError(new WalletRpcError(5760, 'no')),
  ) as ProviderRpcError
  expect(noData.code).toBe(5760)
  expect(noData.data).toBeUndefined()
})
