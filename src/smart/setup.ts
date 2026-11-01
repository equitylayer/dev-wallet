import type { Address, Hex } from 'viem'

import {
  DEVWALLET_PAYMASTER_CODE,
  ENTRY_POINT_07_CODE,
  KERNEL_IMMUTABLE_RANGES,
  KERNEL_V3_3_CODE,
  SENDER_CREATOR_07_CODE,
} from './aa-code.generated'
import {
  DEVWALLET_PAYMASTER,
  ENTRY_POINT_07,
  KERNEL_V3_3,
  SENDER_CREATOR_07,
} from './constants'
import type { Node } from './node'

export type AaStatus =
  | { ok: true; installed: Address[] }
  | { ok: false; conflicts: Address[] }

const REFERENCE_KERNEL = KERNEL_V3_3_CODE.toLowerCase()

/**
 * Kernel v3.3 is recognized by its mainnet build with the deploy-time
 * immutables (cached chain id and domain separator) masked: same length, and
 * equal everywhere outside `KERNEL_IMMUTABLE_RANGES`.
 */
export function isKnownKernelCode(code: Hex): boolean {
  const candidate = code.toLowerCase()
  if (candidate.length !== REFERENCE_KERNEL.length) return false

  // Hex offsets: skip the `0x`, then two characters per byte.
  let from = 2
  for (const [start, end] of KERNEL_IMMUTABLE_RANGES) {
    const to = 2 + start * 2
    if (candidate.slice(from, to) !== REFERENCE_KERNEL.slice(from, to)) {
      return false
    }
    from = 2 + end * 2
  }
  return candidate.slice(from) === REFERENCE_KERNEL.slice(from)
}

function exactly(expected: Hex) {
  const reference = expected.toLowerCase()
  return (code: Hex) => code.toLowerCase() === reference
}

const CONTRACTS: {
  address: Address
  code: Hex
  isKnown(code: Hex): boolean
}[] = [
  {
    address: ENTRY_POINT_07,
    code: ENTRY_POINT_07_CODE,
    isKnown: exactly(ENTRY_POINT_07_CODE),
  },
  {
    address: SENDER_CREATOR_07,
    code: SENDER_CREATOR_07_CODE,
    isKnown: exactly(SENDER_CREATOR_07_CODE),
  },
  { address: KERNEL_V3_3, code: KERNEL_V3_3_CODE, isKnown: isKnownKernelCode },
  {
    address: DEVWALLET_PAYMASTER,
    code: DEVWALLET_PAYMASTER_CODE,
    isKnown: exactly(DEVWALLET_PAYMASTER_CODE),
  },
]

/**
 * Installs the account-abstraction contracts that are missing on the node.
 * Known code (including another chain's Kernel build) is left as is. If any
 * address holds unrecognized code, nothing is written and it is reported in
 * `conflicts`.
 */
export async function ensureAaContracts(node: Node): Promise<AaStatus> {
  const existing = await Promise.all(
    CONTRACTS.map(({ address }) => node.getCode(address)),
  )

  const conflicts: Address[] = []
  const missing: typeof CONTRACTS = []
  CONTRACTS.forEach((contract, i) => {
    const code = existing[i]
    if (code === '0x') missing.push(contract)
    else if (!contract.isKnown(code)) conflicts.push(contract.address)
  })

  if (conflicts.length > 0) return { ok: false, conflicts }

  for (const { address, code } of missing) await node.setCode(address, code)
  return { ok: true, installed: missing.map(({ address }) => address) }
}
