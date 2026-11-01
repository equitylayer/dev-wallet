import { describe, expect, test } from 'bun:test'

import { WalletRpcError } from '~/smart/errors'

import {
  SIGNATURE_METHODS,
  TRANSACTION_METHODS,
  assertEthAccountsRequest,
  declinedError,
  isTransactionMethod,
  opensSidebar,
  permissionsFor,
  requiresApproval,
  withSerializedErrors,
} from './methods'

test('method lists', () => {
  expect(SIGNATURE_METHODS).toEqual([
    'eth_sign',
    'personal_sign',
    'eth_signTypedData_v4',
  ])
  expect(TRANSACTION_METHODS).toEqual(['eth_sendTransaction', 'wallet_sendCalls'])
})

test('isTransactionMethod is true only for the send methods', () => {
  expect(isTransactionMethod('eth_sendTransaction')).toBe(true)
  expect(isTransactionMethod('wallet_sendCalls')).toBe(true)
  expect(isTransactionMethod('eth_sendRawTransaction')).toBe(false)
  expect(isTransactionMethod('wallet_getCallsStatus')).toBe(false)
})

test('transaction methods need approval unless bypassed', () => {
  expect(requiresApproval('eth_sendTransaction', {})).toBe(true)
  expect(requiresApproval('wallet_sendCalls', {})).toBe(true)
  expect(
    requiresApproval('eth_sendTransaction', { bypassTransactionAuth: true }),
  ).toBe(false)
  expect(
    requiresApproval('wallet_sendCalls', { bypassTransactionAuth: true }),
  ).toBe(false)
})

test('signature methods need approval unless bypassed', () => {
  for (const method of SIGNATURE_METHODS) {
    expect(requiresApproval(method, {})).toBe(true)
    expect(requiresApproval(method, { bypassSignatureAuth: true })).toBe(false)
  }
})

test('the signature and transaction bypasses are independent', () => {
  expect(
    requiresApproval('eth_sendTransaction', { bypassSignatureAuth: true }),
  ).toBe(true)
  expect(
    requiresApproval('personal_sign', { bypassTransactionAuth: true }),
  ).toBe(true)
})

test('read-only methods never need approval', () => {
  expect(requiresApproval('eth_call', {})).toBe(false)
  expect(requiresApproval('eth_requestAccounts', {})).toBe(false)
  expect(requiresApproval('wallet_getCallsStatus', {})).toBe(false)
})

test('opensSidebar covers every approval method plus connect and status', () => {
  expect(opensSidebar('wallet_requestPermissions', {})).toBe(true)
  expect(opensSidebar('eth_requestAccounts', {})).toBe(true)
  expect(opensSidebar('wallet_showCallsStatus', {})).toBe(true)
  expect(opensSidebar('eth_sendTransaction', {})).toBe(true)
  expect(opensSidebar('personal_sign', {})).toBe(true)
})

test('opensSidebar honours the bypass settings for approval methods only', () => {
  expect(
    opensSidebar('eth_sendTransaction', { bypassTransactionAuth: true }),
  ).toBe(false)
  expect(opensSidebar('eth_sign', { bypassSignatureAuth: true })).toBe(false)
  expect(
    opensSidebar('eth_requestAccounts', {
      bypassSignatureAuth: true,
      bypassTransactionAuth: true,
    }),
  ).toBe(true)
  expect(opensSidebar('eth_call', {})).toBe(false)
  expect(opensSidebar('wallet_getPermissions', {})).toBe(false)
})

test('permissionsFor reports eth_accounts for a connected origin', () => {
  const permissions = permissionsFor('https://a', true)
  expect(permissions).toHaveLength(1)
  expect(permissions[0]).toEqual({
    invoker: 'https://a',
    parentCapability: 'eth_accounts',
    caveats: [],
  })
})

test('permissionsFor is empty when not connected', () => {
  expect(permissionsFor('https://a', false)).toEqual([])
})

test('assertEthAccountsRequest accepts a lone eth_accounts request', () => {
  expect(() => assertEthAccountsRequest([{ eth_accounts: {} }])).not.toThrow()
})

test('assertEthAccountsRequest rejects other capabilities with -32602', () => {
  const rejected = (params: unknown) => {
    try {
      assertEthAccountsRequest(params)
    } catch (e) {
      return (e as { code: number }).code
    }
  }
  expect(rejected([{ eth_accounts: {}, eth_sendTransaction: {} }])).toBe(-32602)
  expect(rejected([{ eth_sendTransaction: {} }])).toBe(-32602)
})

test('assertEthAccountsRequest rejects malformed params with -32602', () => {
  const rejected = (params: unknown) => {
    try {
      assertEthAccountsRequest(params)
    } catch (e) {
      return (e as { code: number }).code
    }
  }
  expect(rejected(undefined)).toBe(-32602)
  expect(rejected([])).toBe(-32602)
  expect(rejected([{}])).toBe(-32602)
  expect(rejected([null])).toBe(-32602)
  expect(rejected([[]])).toBe(-32602)
  expect(rejected([{ eth_accounts: null }])).toBe(-32602)
  expect(rejected([{ eth_accounts: 'yes' }])).toBe(-32602)
  expect(rejected({ eth_accounts: {} })).toBe(-32602)
  expect(rejected([{ eth_accounts: {} }, { eth_accounts: {} }])).toBe(-32602)
})

test('withSerializedErrors keeps the code of a thrown WalletRpcError', async () => {
  const handler = withSerializedErrors(async () => {
    throw new WalletRpcError(5760, 'no', { why: 'x' })
  })
  expect(await handler({ request: { id: 7 } }, {})).toEqual({
    id: 7,
    jsonrpc: '2.0',
    error: { code: 5760, message: 'no', data: { why: 'x' } },
  })
})

test('withSerializedErrors turns a plain Error into -32603', async () => {
  const handler = withSerializedErrors(async () => {
    throw new Error('boom')
  })
  expect(await handler({ request: { id: 8 } }, {})).toStrictEqual({
    id: 8,
    jsonrpc: '2.0',
    error: { code: -32603, message: 'boom' },
  })
})

test('withSerializedErrors never replies with a string error', async () => {
  const handler = withSerializedErrors(async () => {
    throw 'a string'
  })
  const reply = await handler({ request: { id: 9 } }, {})
  expect(typeof reply.error).toBe('object')
  expect(reply.error).toStrictEqual({ code: -32603, message: 'a string' })
})

test('withSerializedErrors passes a normal reply through, with its arguments', async () => {
  const seen: unknown[] = []
  const handler = withSerializedErrors(async (payload, meta) => {
    seen.push(payload, meta)
    return { id: 1, jsonrpc: '2.0', result: '0x1' } as const
  })
  const payload = { request: { id: 1 } }
  const meta = { sender: 'tab' }
  expect(await handler(payload, meta)).toEqual({
    id: 1,
    jsonrpc: '2.0',
    result: '0x1',
  })
  expect(seen).toEqual([payload, meta])
})

describe('declinedError', () => {
  const request = { id: 3, method: 'wallet_sendCalls', params: [] }

  test('a rejection is 4001 and carries the request', () => {
    const error = declinedError(request, 'rejected')
    expect(error).toBeInstanceOf(WalletRpcError)
    expect(error.code).toBe(4001)
    expect(error.message).toBe('The user rejected the request.')
    expect(error.data).toEqual({ request })
  })

  test('a timeout is 4001 and says so', () => {
    const error = declinedError(request, 'expired')
    expect(error.code).toBe(4001)
    expect(error.message).toBe('The request timed out waiting for approval.')
  })

  test('a rejected account upgrade is 5750; a timed out one stays 4001', () => {
    expect(declinedError(request, 'rejected', { upgrade: true }).code).toBe(
      5750,
    )
    expect(declinedError(request, 'expired', { upgrade: true }).code).toBe(
      4001,
    )
  })

  test('"batched" is a 4001 until the batch queue exists', () => {
    expect(declinedError(request, 'batched').code).toBe(4001)
  })
})
