import {
  type Address,
  type Hash,
  type Hex,
  type RpcTransactionReceipt,
  numberToHex,
} from 'viem'

import type { BatchRecord } from './batch-records'
import type { Node } from './node'
import { userOpOutcomeFromReceipt } from './userop'

/** The only EIP-5792 version the wallet speaks. */
export const EIP5792_VERSION = '2.0.0'

type CallsReceipt = {
  logs: { address: Address; data: Hex; topics: Hex[] }[]
  status: '0x1' | '0x0'
  blockHash: Hex
  blockNumber: Hex
  gasUsed: Hex
  transactionHash: Hash
}

export type CallsStatus = {
  version: typeof EIP5792_VERSION
  id: string
  chainId: Hex
  /** 100 pending, 200 confirmed, 500 reverted, 600 partially reverted. */
  status: 100 | 200 | 400 | 500 | 600
  atomic: boolean
  receipts?: CallsReceipt[]
}

const PENDING = 100
const CONFIRMED = 200
const REVERTED = 500
const PARTIALLY_REVERTED = 600

function toCallsReceipt(
  receipt: RpcTransactionReceipt,
  status: CallsReceipt['status'] = receipt.status === '0x1' ? '0x1' : '0x0',
): CallsReceipt {
  return {
    logs: receipt.logs.map(({ address, data, topics }) => ({
      address,
      data,
      topics: [...topics],
    })),
    status,
    blockHash: receipt.blockHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    transactionHash: receipt.transactionHash,
  }
}

/**
 * What a mined `handleOps` receipt means for the batch. Its own status says
 * nothing about the user operation, so the operation's event decides, and the
 * receipt shows that outcome and only the operation's own logs. A transaction
 * mined without that event did not execute the operation: that is a failure,
 * and the receipt keeps its own status and all of the transaction's logs.
 */
function userOpResult(
  receipt: RpcTransactionReceipt,
  userOpHash: Hex | undefined,
): { status: 200 | 500; receipts: CallsReceipt[] } {
  const outcome = userOpHash && userOpOutcomeFromReceipt(receipt, userOpHash)
  if (!outcome) {
    return { status: REVERTED, receipts: [toCallsReceipt(receipt)] }
  }
  return {
    status: outcome.success ? CONFIRMED : REVERTED,
    receipts: [
      toCallsReceipt(
        { ...receipt, logs: outcome.logs },
        outcome.success ? '0x1' : '0x0',
      ),
    ],
  }
}

/**
 * Reads the batch's transactions and maps them to an EIP-5792 status. While
 * any is unmined the status is `100`, with no receipts.
 */
export async function getCallsStatus(
  node: Node,
  record: BatchRecord,
): Promise<CallsStatus> {
  const base = {
    version: EIP5792_VERSION,
    id: record.id,
    chainId: numberToHex(record.chainId),
    atomic: record.path !== 'sequential',
  } as const

  const raw = await Promise.all(
    record.transactionHashes.map((hash) =>
      node.request<RpcTransactionReceipt | null>('eth_getTransactionReceipt', [
        hash,
      ]),
    ),
  )
  const mined = raw.filter((r): r is RpcTransactionReceipt => r !== null)
  if (mined.length < raw.length) return { ...base, status: PENDING }

  if (record.path === 'userop') {
    return {
      ...base,
      ...userOpResult(mined[0] as RpcTransactionReceipt, record.userOpHash),
    }
  }

  const receipts = mined.map((r) => toCallsReceipt(r))
  const succeeded = receipts.filter((r) => r.status === '0x1').length
  const status =
    succeeded === receipts.length
      ? CONFIRMED
      : succeeded === 0
        ? REVERTED
        : PARTIALLY_REVERTED
  return { ...base, status, receipts }
}
