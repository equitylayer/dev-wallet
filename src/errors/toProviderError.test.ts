import { expect, test } from 'bun:test'
import { RpcRequestError } from 'viem'

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

// viem's HttpRpcClient throws this when a node answers a JSON-RPC error with a
// non-2xx HTTP status (hosted RPCs do).
test('serializeError keeps code, data and the node message of a viem RpcRequestError', () => {
  const error = new RpcRequestError({
    body: { method: 'eth_call', id: 1 },
    error: { code: 3, message: 'execution reverted', data: '0xdead' },
    status: 400,
    url: 'https://rpc.example',
  })
  // The decorated message buries the node's text.
  expect(error.message).not.toBe('execution reverted')

  expect(serializeError(error)).toStrictEqual({
    code: 3,
    message: 'execution reverted',
    data: '0xdead',
  })
})

test('a serialized RpcRequestError reaches the dApp with its revert data', () => {
  const error = toProviderError(
    serializeError(
      new RpcRequestError({
        body: {},
        error: { code: 3, message: 'execution reverted', data: '0xdead' },
        status: 400,
        url: 'https://rpc.example',
      }),
    ),
  ) as ProviderRpcError
  expect(error.code).toBe(3)
  expect(error.data).toBe('0xdead')
  expect(error.message).toBe('execution reverted')
})

test('serializeError keeps the code of any error with a numeric code', () => {
  const error = Object.assign(new Error('nope'), { code: 4001, data: { a: 1 } })
  expect(serializeError(error)).toStrictEqual({
    code: 4001,
    message: 'nope',
    data: { a: 1 },
  })
  expect(
    serializeError(Object.assign(new Error('nope'), { code: -32000 })),
  ).toStrictEqual({ code: -32000, message: 'nope' })
})

test('serializeError maps string codes (Node system errors) to -32603', () => {
  const error = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8545'), {
    code: 'ECONNREFUSED',
  })
  expect(serializeError(error)).toStrictEqual({
    code: -32603,
    message: 'connect ECONNREFUSED 127.0.0.1:8545',
  })
})
