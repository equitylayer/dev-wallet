import { expect, test } from 'bun:test'

import {
  SIGNATURE_METHODS,
  TRANSACTION_METHODS,
  assertEthAccountsRequest,
  opensSidebar,
  permissionsFor,
  requiresApproval,
} from './methods'

test('method lists', () => {
  expect(SIGNATURE_METHODS).toEqual([
    'eth_sign',
    'personal_sign',
    'eth_signTypedData_v4',
  ])
  expect(TRANSACTION_METHODS).toEqual(['eth_sendTransaction', 'wallet_sendCalls'])
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
