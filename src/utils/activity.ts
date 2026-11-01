// How the activity lists read user operations: which blocks to search, which
// transactions ran the account's operations, and what a row describes. Pure,
// so it is unit-tested; `useAccountActivity` and the lists only use it.
import {
  type Address,
  type Hash,
  type Hex,
  type Transaction,
  isAddressEqual,
} from 'viem'

import { DEVWALLET_SPONSOR } from '~/smart/constants'
import { decodeHandleOps } from '~/smart/decode'
import type { Call } from '~/smart/types'

/** The account's user operations in one transaction, taken together. */
export type AccountUserOps = {
  /** Their calls in order, or `null` if one of them isn't a Kernel batch. */
  calls: Call[] | null
  /** Whether all of them ran without reverting. */
  success: boolean
}

export type ActivityItem = {
  transaction: Transaction
  status: 'pending' | 'mined'
  /** Set when the transaction ran user operations the account sent. */
  userOps?: AccountUserOps
}

/** A `UserOperationEvent` log, as `getLogs` returns it. */
export type UserOpLog = {
  transactionHash: Hash | null
  address: Address
  topics: Hex[]
  data: Hex
  args: { sender?: Address }
}

/** Names for addresses DevWallet itself uses, for the activity lists. */
export function knownName(address?: Address | null): string | undefined {
  if (address && isAddressEqual(address, DEVWALLET_SPONSOR))
    return 'DevWallet sponsor'
  return undefined
}

/**
 * The first block the user-operation search covers: the oldest block among
 * the loaded transactions, since the pages hold every transaction from there
 * to the latest block. With no more pages to load, the scan reached genesis.
 * `undefined` when nothing tells yet.
 */
export function activityFromBlock({
  transactions,
  hasNextPage,
}: {
  transactions: readonly Pick<Transaction, 'blockNumber'>[]
  hasNextPage: boolean
}): bigint | undefined {
  if (!hasNextPage) return 0n
  let oldest: bigint | undefined
  for (const { blockNumber } of transactions) {
    if (blockNumber === null) continue
    if (oldest === undefined || blockNumber < oldest) oldest = blockNumber
  }
  return oldest
}

/**
 * The loaded transactions that ran operations `account` sent, according to
 * its `UserOperationEvent` logs, with what those operations did. The value
 * is `undefined` where the transaction can't be decoded (for example, a
 * bundler that reaches the EntryPoint through a contract).
 */
export function userOpsByTransaction({
  account,
  transactions,
  logs,
}: {
  account: Address
  transactions: readonly Transaction[]
  logs: readonly UserOpLog[]
}): Map<Hash, AccountUserOps | undefined> {
  const logsByHash = new Map<Hash, UserOpLog[]>()
  for (const log of logs) {
    // The sender filter is the node's; check it here as well.
    if (!log.transactionHash || !log.args.sender) continue
    if (!isAddressEqual(log.args.sender, account)) continue
    logsByHash.set(log.transactionHash, [
      ...(logsByHash.get(log.transactionHash) ?? []),
      log,
    ])
  }

  const found = new Map<Hash, AccountUserOps | undefined>()
  for (const tx of transactions) {
    const txLogs = logsByHash.get(tx.hash)
    if (!txLogs) continue
    const ops = decodeHandleOps(tx, { logs: txLogs })?.filter((op) =>
      isAddressEqual(op.sender, account),
    )
    found.set(
      tx.hash,
      ops?.length
        ? {
            calls: ops.every((op) => op.calls)
              ? ops.flatMap((op) => op.calls ?? [])
              : null,
            success: ops.every((op) => op.success),
          }
        : undefined,
    )
  }
  return found
}

/**
 * What an activity row describes. For a transaction that ran the account's
 * user operations, that is their calls, not the bundler's `handleOps`: `to`
 * and `input` are the first call's, `value` is the calls' total, and `count`
 * says how many there are. Otherwise it is the transaction itself.
 */
export function activitySubject({ transaction, userOps }: ActivityItem): {
  to: Address | null
  value: bigint
  input: Hex
  count: number
} {
  const calls = userOps?.calls
  const [first] = calls ?? []
  if (!calls || !first)
    return {
      to: transaction.to,
      value: transaction.value,
      input: transaction.input,
      count: 1,
    }
  return {
    to: first.to ?? null,
    value: calls.reduce((total, call) => total + (call.value ?? 0n), 0n),
    input: first.data ?? '0x',
    count: calls.length,
  }
}
