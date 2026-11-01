// Reads EntryPoint transactions after the fact, for the transaction and
// activity views. Chrome-free, so `bun test` can import it.
import {
  type Address,
  type Hex,
  decodeEventLog,
  decodeFunctionData,
  getAbiItem,
  getAddress,
  isAddressEqual,
  size,
  slice,
  zeroAddress,
} from 'viem'
import { entryPoint07Abi } from 'viem/account-abstraction'

import { ENTRY_POINT_07 } from './constants'
import { decodeKernelBatch } from './kernel'
import type { Call } from './types'

/** The EntryPoint v0.7's event for each operation it ran (indexed `sender`). */
export const USER_OPERATION_EVENT = getAbiItem({
  abi: entryPoint07Abi,
  name: 'UserOperationEvent',
})

export type UserOpSummary = {
  sender: Address
  nonce: bigint
  success: boolean
  actualGasCost: bigint
  paymaster: Address
  /** The op's calls, or `null` when its call data isn't a Kernel batch. */
  calls: Call[] | null
}

type ReceiptLog = { address: Address; topics: Hex[]; data: Hex }

function userOperationEvents(logs: readonly ReceiptLog[]) {
  return logs.flatMap((log) => {
    if (!isAddressEqual(log.address, ENTRY_POINT_07)) return []
    try {
      return [
        decodeEventLog({
          abi: [USER_OPERATION_EVENT],
          data: log.data,
          topics: log.topics as [Hex, ...Hex[]],
        }).args,
      ]
    } catch {
      return []
    }
  })
}

/** A v0.7 `paymasterAndData` starts with the paymaster's address. */
function paymasterOf(paymasterAndData: Hex): Address {
  return size(paymasterAndData) >= 20
    ? getAddress(slice(paymasterAndData, 0, 20))
    : zeroAddress
}

/**
 * The operations in a `handleOps` transaction to `ENTRY_POINT_07`, with each
 * one's outcome from its `UserOperationEvent` in the receipt, or `null` when
 * the transaction is anything else. An operation without an event (for
 * example, `handleOps` reverted) did not run: it reads as failed, at no cost.
 */
export function decodeHandleOps(
  tx: { to: Address | null; input: Hex },
  receipt: { logs: readonly ReceiptLog[] },
): UserOpSummary[] | null {
  if (!tx.to || !isAddressEqual(tx.to, ENTRY_POINT_07)) return null

  let ops: readonly {
    sender: Address
    nonce: bigint
    callData: Hex
    paymasterAndData: Hex
  }[]
  try {
    const decoded = decodeFunctionData({ abi: entryPoint07Abi, data: tx.input })
    if (decoded.functionName !== 'handleOps') return null
    ops = decoded.args[0]
  } catch {
    return null
  }

  const events = userOperationEvents(receipt.logs)
  return ops.map((op) => {
    // An account's nonce never repeats, so sender and nonce name the op.
    const event = events.find(
      (e) => isAddressEqual(e.sender, op.sender) && e.nonce === op.nonce,
    )
    return {
      sender: getAddress(op.sender),
      nonce: op.nonce,
      success: event?.success ?? false,
      actualGasCost: event?.actualGasCost ?? 0n,
      paymaster: event
        ? getAddress(event.paymaster)
        : paymasterOf(op.paymasterAndData),
      calls: decodeKernelBatch(op.callData),
    }
  })
}
