import { afterEach, beforeEach, expect, test } from 'bun:test'
import { bytesToHex, hexToBytes } from 'viem'

import {
  DEVWALLET_PAYMASTER_CODE,
  KERNEL_IMMUTABLE_RANGES,
  KERNEL_V3_3_CODE,
} from './aa-code.generated'
import {
  DEVWALLET_PAYMASTER,
  ENTRY_POINT_07,
  KERNEL_V3_3,
  SENDER_CREATOR_07,
} from './constants'
import { type Node, connectNode } from './node'
import { ensureAaContracts, isKnownKernelCode } from './setup'
import { startAnvil } from './testing/anvil'
import { KERNEL_V3_3_ARBITRUM_SEPOLIA_CODE } from './testing/kernel-arbitrum-sepolia.generated'

// Each test gets its own fresh Anvil so installs never leak between tests.
let anvil: { rpcUrl: string; stop(): Promise<void> }
let node: Node
beforeEach(async () => {
  anvil = await startAnvil()
  node = await connectNode({ rpcUrl: anvil.rpcUrl })
})
afterEach(() => anvil.stop())

test('installs all four contracts on a fresh chain', async () => {
  const status = await ensureAaContracts(node)
  expect(status).toEqual({
    ok: true,
    installed: [
      ENTRY_POINT_07,
      SENDER_CREATOR_07,
      KERNEL_V3_3,
      DEVWALLET_PAYMASTER,
    ],
  })
  expect(await node.getCode(KERNEL_V3_3)).toBe(KERNEL_V3_3_CODE)
  expect(await node.getCode(DEVWALLET_PAYMASTER)).toBe(DEVWALLET_PAYMASTER_CODE)
})

test('second run installs nothing', async () => {
  await ensureAaContracts(node)
  expect(await ensureAaContracts(node)).toEqual({ ok: true, installed: [] })
})

test("accepts d1's Arbitrum Sepolia Kernel build untouched", async () => {
  await node.setCode(KERNEL_V3_3, KERNEL_V3_3_ARBITRUM_SEPOLIA_CODE)
  expect((await ensureAaContracts(node)).ok).toBe(true)
  expect(await node.getCode(KERNEL_V3_3)).toBe(
    KERNEL_V3_3_ARBITRUM_SEPOLIA_CODE,
  )
})

test('refuses to overwrite unknown code', async () => {
  await node.setCode(KERNEL_V3_3, '0x6000')
  expect(await ensureAaContracts(node)).toEqual({
    ok: false,
    conflicts: [KERNEL_V3_3],
  })
  expect(await node.getCode(KERNEL_V3_3)).toBe('0x6000')
  // A conflict blocks the whole install, not just the conflicting address.
  expect(await node.getCode(ENTRY_POINT_07)).toBe('0x')
})

test('isKnownKernelCode masks only immutables', () => {
  expect(isKnownKernelCode(KERNEL_V3_3_CODE)).toBe(true)
  expect(isKnownKernelCode(KERNEL_V3_3_ARBITRUM_SEPOLIA_CODE)).toBe(true)
  const flipAt = KERNEL_IMMUTABLE_RANGES[0][0] - 1
  const bytes = hexToBytes(KERNEL_V3_3_CODE)
  bytes[flipAt] ^= 0xff
  expect(isKnownKernelCode(bytesToHex(bytes))).toBe(false)
})
