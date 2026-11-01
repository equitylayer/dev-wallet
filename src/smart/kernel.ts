import {
  type Address,
  type Hex,
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  parseAbi,
  size,
} from 'viem'

import {
  DELEGATION_PREFIX,
  KERNEL_EXECUTE_BATCH_MODE,
  KERNEL_V3_3,
} from './constants'
import type { Node } from './node'
import type { Call, OnchainKind } from './types'

const kernelAbi = parseAbi(['function execute(bytes32 mode, bytes data)'])

// Kernel's `Execution` struct, as abi-encoded in a batch's calldata.
const batchParameters = [
  {
    type: 'tuple[]',
    components: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'callData', type: 'bytes' },
    ],
  },
] as const

/** Calldata for Kernel's `execute` in batch mode (reverts if any call fails). */
export function encodeKernelBatch(calls: readonly Call[]): Hex {
  const executionCalldata = encodeAbiParameters(batchParameters, [
    calls.map(({ to, value = 0n, data = '0x' }) => {
      // A call without `to` is a contract creation, which a batch can't express.
      if (to === undefined) {
        throw new Error('A Kernel batch call needs a `to` address')
      }
      return { target: to, value, callData: data }
    }),
  ])
  return encodeFunctionData({
    abi: kernelAbi,
    functionName: 'execute',
    args: [KERNEL_EXECUTE_BATCH_MODE, executionCalldata],
  })
}

/** The calls in a Kernel batch `execute`, or `null` if `data` isn't one. */
export function decodeKernelBatch(data: Hex): Call[] | null {
  try {
    const { args } = decodeFunctionData({ abi: kernelAbi, data })
    const [mode, executionCalldata] = args
    if (mode.toLowerCase() !== KERNEL_EXECUTE_BATCH_MODE) return null
    const [executions] = decodeAbiParameters(batchParameters, executionCalldata)
    return executions.map((e) => ({
      to: e.target,
      value: e.value,
      data: e.callData,
    }))
  } catch {
    return null
  }
}

/** The code an EIP-7702 delegation to `target` leaves on an account. */
export function delegationCode(target: Address): Hex {
  return `${DELEGATION_PREFIX}${target.slice(2).toLowerCase()}`
}

const KERNEL_DELEGATION = delegationCode(KERNEL_V3_3)
// The delegation prefix is 3 bytes, followed by a 20-byte address.
const DELEGATION_SIZE = 23

/** What an address's deployed code says it is. */
export function classifyCode(code: Hex): OnchainKind {
  const lower = code.toLowerCase() as Hex
  if (lower === '0x') return { kind: 'eoa' }
  if (lower === KERNEL_DELEGATION) return { kind: 'kernel' }
  if (lower.startsWith(DELEGATION_PREFIX) && size(lower) === DELEGATION_SIZE) {
    return {
      kind: 'delegated',
      target: getAddress(`0x${lower.slice(DELEGATION_PREFIX.length)}`),
    }
  }
  return { kind: 'contract' }
}

/**
 * Points `address` at `target` through an EIP-7702 delegation, or clears its
 * code when `target` is `null`. Dev-chain only: it writes the code directly.
 */
export async function setDelegation(
  node: Node,
  address: Address,
  target: Address | null,
): Promise<void> {
  await node.setCode(address, target ? delegationCode(target) : '0x')
}
