import { expect, test } from 'bun:test'
import {
  getAddress,
  keccak256,
  size,
  slice,
  toFunctionSelector,
  toHex,
} from 'viem'

import {
  DELEGATION_PREFIX,
  DEVWALLET_PAYMASTER,
  DEVWALLET_SPONSOR,
  ENTRY_POINT_07,
  ERC1271_MAGIC,
  KERNEL_EXECUTE_BATCH_MODE,
  KERNEL_V3_3,
  SENDER_CREATOR_07,
} from './constants'

test('addresses are checksummed', () => {
  for (const a of [
    ENTRY_POINT_07,
    SENDER_CREATOR_07,
    KERNEL_V3_3,
    DEVWALLET_SPONSOR,
    DEVWALLET_PAYMASTER,
  ]) {
    expect(getAddress(a)).toBe(a)
  }
})

test('DevWallet addresses are the last 20 bytes of their name hash', () => {
  expect(DEVWALLET_SPONSOR).toBe(
    getAddress(slice(keccak256(toHex('devwallet.sponsor')), 12)),
  )
  expect(DEVWALLET_PAYMASTER).toBe(
    getAddress(slice(keccak256(toHex('devwallet.paymaster')), 12)),
  )
})

test('Kernel delegation code is the prefix plus the Kernel address', () => {
  expect(`${DELEGATION_PREFIX}${KERNEL_V3_3.slice(2)}`.toLowerCase()).toBe(
    '0xef0100d6cedde84be40893d153be9d467cd6ad37875b28',
  )
})

test('ERC-1271 magic is the isValidSignature selector', () => {
  expect(ERC1271_MAGIC).toBe(
    toFunctionSelector('isValidSignature(bytes32,bytes)'),
  )
})

test('batch mode is 0x01 followed by 31 zero bytes', () => {
  expect(size(KERNEL_EXECUTE_BATCH_MODE)).toBe(32)
  expect(KERNEL_EXECUTE_BATCH_MODE).toBe(`0x01${'00'.repeat(31)}`)
})
