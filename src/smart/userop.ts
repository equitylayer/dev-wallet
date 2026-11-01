import {
  type Address,
  type Hash,
  type Hex,
  type RpcTransactionReceipt,
  decodeErrorResult,
  decodeFunctionResult,
  encodeFunctionData,
  hexToBigInt,
  isAddressEqual,
  isHex,
  parseEventLogs,
} from 'viem'
import {
  type UserOperation,
  entryPoint07Abi,
  getUserOperationHash,
  toPackedUserOperation,
} from 'viem/account-abstraction'

import { DEVWALLET_PAYMASTER, ENTRY_POINT_07 } from './constants'
import { WalletRpcError } from './errors'
import { encodeKernelBatch } from './kernel'
import type { Node } from './node'
import type { Call } from './types'

const ONE_GWEI = 1_000_000_000n
// Used when the batch can't be estimated (e.g. it would revert), so the op
// still goes through and the failure shows up in its outcome.
const FALLBACK_CALL_GAS_LIMIT = 1_000_000n

async function getNonce(node: Node, sender: Address): Promise<bigint> {
  const result = await node.request<Hex>('eth_call', [
    {
      to: ENTRY_POINT_07,
      data: encodeFunctionData({
        abi: entryPoint07Abi,
        functionName: 'getNonce',
        args: [sender, 0n],
      }),
    },
    'latest',
  ])
  return decodeFunctionResult({
    abi: entryPoint07Abi,
    functionName: 'getNonce',
    data: result,
  })
}

async function estimateCallGasLimit(
  node: Node,
  sender: Address,
  callData: Hex,
): Promise<bigint> {
  try {
    const estimate = hexToBigInt(
      await node.request<Hex>('eth_estimateGas', [
        { from: sender, to: sender, data: callData },
      ]),
    )
    return (estimate * 12n) / 10n + 50_000n
  } catch {
    return FALLBACK_CALL_GAS_LIMIT
  }
}

async function getFees(
  node: Node,
): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  const [maxPriorityFeePerGas, latest] = await Promise.all([
    node.request<Hex>('eth_maxPriorityFeePerGas').then(
      (fee) => hexToBigInt(fee),
      () => ONE_GWEI,
    ),
    node.request<{ baseFeePerGas?: Hex }>('eth_getBlockByNumber', [
      'latest',
      false,
    ]),
  ])
  const baseFee = latest.baseFeePerGas ? hexToBigInt(latest.baseFeePerGas) : 0n
  return {
    maxFeePerGas: baseFee * 2n + maxPriorityFeePerGas,
    maxPriorityFeePerGas,
  }
}

/**
 * An unsigned user operation that runs `calls` as one atomic Kernel batch,
 * with gas paid by the DevWallet paymaster.
 */
export async function buildUserOp(
  node: Node,
  { sender, calls }: { sender: Address; calls: readonly Call[] },
): Promise<UserOperation<'0.7'>> {
  const callData = encodeKernelBatch(calls)
  const [nonce, callGasLimit, fees] = await Promise.all([
    getNonce(node, sender),
    estimateCallGasLimit(node, sender, callData),
    getFees(node),
  ])
  return {
    sender,
    nonce,
    callData,
    callGasLimit,
    verificationGasLimit: 500_000n,
    preVerificationGas: 60_000n,
    paymaster: DEVWALLET_PAYMASTER,
    paymasterVerificationGasLimit: 100_000n,
    paymasterPostOpGasLimit: 0n,
    paymasterData: '0x',
    ...fees,
    signature: '0x',
  }
}

/** Signs the operation's hash as the sender (a personal-sign over the hash). */
export async function signUserOp(
  node: Node,
  op: UserOperation<'0.7'>,
  chainId: number,
): Promise<{ signature: Hex; userOpHash: Hex }> {
  const userOpHash = getUserOperationHash({
    userOperation: op,
    entryPointAddress: ENTRY_POINT_07,
    entryPointVersion: '0.7',
    chainId,
  })
  const signature = await node.request<Hex>('eth_sign', [op.sender, userOpHash])
  return { signature, userOpHash }
}

/** The EntryPoint's reason for refusing an op, if the error carries it. */
function entryPointRejection(error: unknown): unknown {
  const data = error instanceof WalletRpcError ? error.data : undefined
  if (!isHex(data)) return error
  try {
    const decoded = decodeErrorResult({ abi: entryPoint07Abi, data })
    if (
      decoded.errorName === 'FailedOp' ||
      decoded.errorName === 'FailedOpWithRevert'
    ) {
      return new Error(
        `The EntryPoint rejected the user operation: ${decoded.args[1]}`,
      )
    }
  } catch {}
  return error
}

/**
 * Sends `handleOps([op])` from `bundler`, which also collects the fee, and
 * resolves to the transaction hash. It throws, sending nothing, if the
 * EntryPoint would reject the op. An op that is accepted but fails to execute
 * is mined as usual and shows up in `getUserOpOutcome`.
 */
export async function submitUserOp(
  node: Node,
  { op, bundler }: { op: UserOperation<'0.7'>; bundler: Address },
): Promise<Hash> {
  const tx = {
    from: bundler,
    to: ENTRY_POINT_07,
    data: encodeFunctionData({
      abi: entryPoint07Abi,
      functionName: 'handleOps',
      args: [[toPackedUserOperation(op)], bundler],
    }),
  }
  // When the estimate reverts, Anvil falls back to the block gas limit and
  // mines the reverting transaction, so simulate first to refuse an op the
  // EntryPoint would reject.
  try {
    await node.request('eth_call', [tx, 'latest'])
  } catch (error) {
    throw entryPointRejection(error)
  }
  return node.request<Hash>('eth_sendTransaction', [tx])
}

export type UserOpOutcome = {
  success: boolean
  actualGasCost: bigint
  paymaster: Address
}

/**
 * What happened to the operation in a mined `handleOps` transaction, or
 * `null` while the transaction is unmined. Throws if it was mined but carries
 * no event for the operation (for example, `handleOps` reverted).
 */
export async function getUserOpOutcome(
  node: Node,
  transactionHash: Hash,
  userOpHash: Hex,
): Promise<UserOpOutcome | null> {
  const receipt = await node.request<RpcTransactionReceipt | null>(
    'eth_getTransactionReceipt',
    [transactionHash],
  )
  if (!receipt) return null

  const event = parseEventLogs({
    abi: entryPoint07Abi,
    eventName: 'UserOperationEvent',
    logs: receipt.logs,
  }).find(
    (log) =>
      isAddressEqual(log.address, ENTRY_POINT_07) &&
      log.args.userOpHash.toLowerCase() === userOpHash.toLowerCase(),
  )
  if (!event) {
    const status = receipt.status === '0x1' ? 'succeeded' : 'reverted'
    throw new Error(
      `Transaction ${transactionHash} ${status} without a UserOperationEvent for ${userOpHash}`,
    )
  }
  const { success, actualGasCost, paymaster } = event.args
  return { success, actualGasCost, paymaster }
}
