import { expect, test } from 'bun:test'

import { WalletRpcError, serializeError } from './errors'

test('WalletRpcError keeps code, message and data', () => {
  const e = new WalletRpcError(4001, 'User rejected', { reason: 'x' })
  expect(e).toBeInstanceOf(Error)
  expect(serializeError(e)).toEqual({
    code: 4001,
    message: 'User rejected',
    data: { reason: 'x' },
  })
})

test('serializeError omits absent data', () => {
  expect(serializeError(new WalletRpcError(-32601, 'nope'))).toStrictEqual({
    code: -32601,
    message: 'nope',
  })
})

test('unknown errors map to -32603', () => {
  expect(serializeError(new Error('boom'))).toStrictEqual({
    code: -32603,
    message: 'boom',
  })
  expect(serializeError('plain string')).toStrictEqual({
    code: -32603,
    message: 'plain string',
  })
})
