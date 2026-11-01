import { describe, expect, test } from 'bun:test'

import { describeTypedData } from './typedData'

const ACCOUNT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const HASH =
  '0x8f4e6d0bd2ff2a6ba0b1d93c3b6b5d3dd7c1b2f3e4a5b6c7d8e9f0a1b2c3d4e5'

const kernelWrapper = () => ({
  domain: {
    name: 'Kernel',
    version: '0.3.3',
    chainId: 31337,
    verifyingContract: ACCOUNT,
  },
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    Kernel: [{ name: 'hash', type: 'bytes32' }],
  },
  primaryType: 'Kernel',
  message: { hash: HASH },
})

const TOKEN = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
const SPENDER = '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD'
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3'

const permitSingle = () => ({
  domain: { name: 'Permit2', chainId: '0x7a69', verifyingContract: PERMIT2 },
  types: {
    PermitSingle: [
      { name: 'details', type: 'PermitDetails' },
      { name: 'spender', type: 'address' },
      { name: 'sigDeadline', type: 'uint256' },
    ],
    PermitDetails: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
  primaryType: 'PermitSingle',
  message: {
    details: {
      token: TOKEN,
      amount: '0xde0b6b3a7640000',
      expiration: 1_767_225_600,
      nonce: 0,
    },
    spender: SPENDER,
    sigDeadline: '1767225600',
  },
})

describe('describeTypedData', () => {
  test('recognizes the Kernel ERC-1271 wrapper', () => {
    expect(describeTypedData(kernelWrapper())).toEqual({
      kind: 'kernel-1271',
      account: ACCOUNT,
      innerHash: HASH,
      chainId: 31337,
    })
  })

  test('reads a Kernel chain id given as a hex or decimal string', () => {
    for (const chainId of ['0x7a69', '31337']) {
      const td = kernelWrapper()
      expect(
        describeTypedData({ ...td, domain: { ...td.domain, chainId } }),
      ).toMatchObject({ kind: 'kernel-1271', chainId: 31337 })
    }
  })

  test('something only named Kernel stays generic', () => {
    const td = kernelWrapper()
    // Not a 32-byte hash.
    expect(
      describeTypedData({ ...td, message: { hash: '0x1234' } }).kind,
    ).toBe('generic')
    // Another primary type.
    expect(
      describeTypedData({
        ...td,
        types: { ...td.types, Other: [{ name: 'hash', type: 'bytes32' }] },
        primaryType: 'Other',
      }).kind,
    ).toBe('generic')
  })

  test('a nested Permit2-style message gives dotted paths', () => {
    const described = describeTypedData(permitSingle())
    expect(described).toEqual({
      kind: 'generic',
      primaryType: 'PermitSingle',
      domain: [
        ['name', 'Permit2'],
        ['chainId', '31337'],
        ['verifyingContract', PERMIT2],
      ],
      fields: [
        { path: 'details.token', type: 'address', value: TOKEN },
        {
          path: 'details.amount',
          type: 'uint160',
          value: '1000000000000000000',
        },
        { path: 'details.expiration', type: 'uint48', value: '1767225600' },
        { path: 'details.nonce', type: 'uint48', value: '0' },
        { path: 'spender', type: 'address', value: SPENDER },
        { path: 'sigDeadline', type: 'uint256', value: '1767225600' },
      ],
    })
  })

  test('renders bigint-ish values as decimal strings', () => {
    const described = describeTypedData({
      types: {
        Values: [
          { name: 'fromHex', type: 'uint256' },
          { name: 'fromNumber', type: 'uint8' },
          { name: 'fromBigint', type: 'int256' },
          { name: 'fromDecimal', type: 'uint256' },
          { name: 'negative', type: 'int64' },
        ],
      },
      primaryType: 'Values',
      message: {
        fromHex: '0xff',
        fromNumber: 7,
        fromBigint: 12345678901234567890n,
        fromDecimal: '42',
        negative: '-5',
      },
    })
    expect(described.kind === 'generic' && described.fields).toEqual([
      { path: 'fromHex', type: 'uint256', value: '255' },
      { path: 'fromNumber', type: 'uint8', value: '7' },
      { path: 'fromBigint', type: 'int256', value: '12345678901234567890' },
      { path: 'fromDecimal', type: 'uint256', value: '42' },
      { path: 'negative', type: 'int64', value: '-5' },
    ])
  })

  test('arrays index into the path, and struct arrays recurse', () => {
    const described = describeTypedData({
      types: {
        Batch: [
          { name: 'ids', type: 'uint256[]' },
          { name: 'items', type: 'Item[]' },
          { name: 'flag', type: 'bool' },
        ],
        Item: [
          { name: 'to', type: 'address' },
          { name: 'note', type: 'string' },
        ],
      },
      primaryType: 'Batch',
      message: {
        ids: ['0x1', 2],
        items: [{ to: TOKEN, note: 'first' }],
        flag: true,
      },
    })
    expect(described.kind === 'generic' && described.fields).toEqual([
      { path: 'ids[0]', type: 'uint256', value: '1' },
      { path: 'ids[1]', type: 'uint256', value: '2' },
      { path: 'items[0].to', type: 'address', value: TOKEN },
      { path: 'items[0].note', type: 'string', value: 'first' },
      { path: 'flag', type: 'bool', value: 'true' },
    ])
  })

  test('missing and malformed values never throw', () => {
    const described = describeTypedData({
      types: {
        Mail: [
          { name: 'to', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'list', type: 'uint8[]' },
        ],
      },
      primaryType: 'Mail',
      message: { amount: 'lots', list: 'nope' },
    })
    expect(described.kind === 'generic' && described.fields).toEqual([
      { path: 'to', type: 'address', value: '' },
      { path: 'amount', type: 'uint256', value: 'lots' },
      { path: 'list', type: 'uint8[]', value: 'nope' },
    ])
  })
})
