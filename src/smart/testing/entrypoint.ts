// Builders for EntryPoint v0.7 transactions and receipt logs, for tests that
// decode them without a node.
import {
  type Address,
  type Hex,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  getAbiItem,
  keccak256,
  parseAbiParameters,
  stringToHex,
  zeroAddress,
} from 'viem'
import {
  type UserOperation,
  entryPoint07Abi,
  toPackedUserOperation,
} from 'viem/account-abstraction'

import { ENTRY_POINT_07 } from '../constants'
import { USER_OPERATION_EVENT } from '../decode'
import { encodeKernelBatch } from '../kernel'
import type { Call } from '../types'

export type TestLog = { address: Address; topics: Hex[]; data: Hex }

/** An op that runs `calls` as a Kernel batch, sponsored by `paymaster` if set. */
export function testOp({
  sender,
  nonce,
  calls,
  callData = encodeKernelBatch(calls ?? []),
  paymaster,
}: {
  sender: Address
  nonce: bigint
  calls?: Call[]
  callData?: Hex
  paymaster?: Address
}): UserOperation<'0.7'> {
  return {
    sender,
    nonce,
    callData,
    callGasLimit: 100_000n,
    verificationGasLimit: 500_000n,
    preVerificationGas: 60_000n,
    maxFeePerGas: 2n,
    maxPriorityFeePerGas: 1n,
    ...(paymaster && {
      paymaster,
      paymasterVerificationGasLimit: 100_000n,
      paymasterPostOpGasLimit: 0n,
      paymasterData: '0x',
    }),
    signature: '0x',
  }
}

/** `handleOps(ops, beneficiary)` calldata. */
export function handleOpsInput(
  ops: UserOperation<'0.7'>[],
  beneficiary: Address = zeroAddress,
): Hex {
  return encodeFunctionData({
    abi: entryPoint07Abi,
    functionName: 'handleOps',
    args: [ops.map((op) => toPackedUserOperation(op)), beneficiary],
  })
}

/** A stand-in user-op hash, distinct for each sender and nonce. */
function opHash(sender: Address, nonce: bigint): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters('address, uint256'), [
      sender,
      nonce,
    ]),
  )
}

/** A `UserOperationEvent` log, emitted by `address` (the EntryPoint). */
export function userOperationEventLog({
  sender,
  nonce,
  success,
  actualGasCost,
  paymaster = zeroAddress,
  address = ENTRY_POINT_07,
}: {
  sender: Address
  nonce: bigint
  success: boolean
  actualGasCost: bigint
  paymaster?: Address
  address?: Address
}): TestLog {
  return {
    address,
    topics: encodeEventTopics({
      abi: [USER_OPERATION_EVENT],
      args: { userOpHash: opHash(sender, nonce), sender, paymaster },
    }) as Hex[],
    data: encodeAbiParameters(
      parseAbiParameters(
        'uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed',
      ),
      [nonce, success, actualGasCost, actualGasCost],
    ),
  }
}

const REVERT_REASON_EVENT = getAbiItem({
  abi: entryPoint07Abi,
  name: 'UserOperationRevertReason',
})

/** The EntryPoint's `UserOperationRevertReason` log for a reverted op. */
export function revertReasonLog({
  sender,
  nonce,
}: {
  sender: Address
  nonce: bigint
}): TestLog {
  return {
    address: ENTRY_POINT_07,
    topics: encodeEventTopics({
      abi: [REVERT_REASON_EVENT],
      args: { userOpHash: opHash(sender, nonce), sender },
    }) as Hex[],
    data: encodeAbiParameters(parseAbiParameters('uint256, bytes'), [
      nonce,
      stringToHex('reverted'),
    ]),
  }
}
