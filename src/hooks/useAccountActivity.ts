import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  type Address,
  type Hash,
  type Hex,
  type Transaction,
  isAddressEqual,
} from 'viem'

import { decodeHandleOps } from '~/smart/decode'
import type { Call } from '~/smart/types'

import { authoritiesQueryOptions } from './useAuthorities'
import { useInfiniteBlockTransactions } from './useInfiniteBlockTransactions'
import { usePendingTransactions } from './usePendingTransactions'
import { useUserOpLogs } from './useUserOpLogs'

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

/**
 * Pending and mined transactions that involve an account: sent from it, sent
 * to it, sponsored on its behalf through an EIP-7702 authorization, or
 * running a user operation it sent.
 */
export function useAccountActivity(accountAddress: Address) {
  const { data: pendingTransactions } = usePendingTransactions()

  const query = useInfiniteBlockTransactions()
  const {
    data: infiniteBlockTransactions,
    hasNextPage,
    isFetched,
    isFetchingNextPage,
  } = query

  const accountLower = accountAddress.toLowerCase()

  const allMined = useMemo(
    () =>
      (infiniteBlockTransactions?.pages.flat() as Transaction[] | undefined) ??
      [],
    [infiniteBlockTransactions],
  )

  // EIP-7702 txs carry authorizations signed by other EOAs. The authority
  // isn't stored explicitly, so it is recovered from each signature.
  const authorizationTxs = useMemo(
    () =>
      allMined.filter(
        (tx) => tx.type === 'eip7702' && (tx.authorizationList?.length ?? 0) > 0,
      ),
    [allMined],
  )
  const authorityResults = useQueries({
    queries: authorizationTxs.map((tx) => authoritiesQueryOptions(tx)),
  })

  // The loaded pages hold every transaction from this block to the latest,
  // so the user-operation search covers the same blocks: All activity's
  // "Load more" is what reaches older ones. With no more pages, that is the
  // whole chain.
  const fromBlock = useMemo(() => {
    if (!isFetched) return undefined
    if (!hasNextPage) return 0n
    let oldest: bigint | undefined
    for (const tx of allMined) {
      if (tx.blockNumber === null) continue
      if (oldest === undefined || tx.blockNumber < oldest)
        oldest = tx.blockNumber
    }
    return oldest
  }, [allMined, hasNextPage, isFetched])
  const { data: userOpLogs } = useUserOpLogs({
    sender: accountAddress,
    fromBlock,
  })

  // The loaded transactions that ran the account's user operations, with what
  // those operations did (undefined where the transaction can't be decoded,
  // for example a bundler that reaches the EntryPoint through a contract).
  const userOpTxs = useMemo(() => {
    const logsByHash = new Map<Hash, NonNullable<typeof userOpLogs>>()
    for (const log of userOpLogs ?? []) {
      // The sender filter is the node's; check it here as well.
      if (!log.transactionHash || !log.args.sender) continue
      if (!isAddressEqual(log.args.sender, accountAddress)) continue
      logsByHash.set(log.transactionHash, [
        ...(logsByHash.get(log.transactionHash) ?? []),
        log,
      ])
    }
    const found = new Map<Hash, AccountUserOps | undefined>()
    for (const tx of allMined) {
      const logs = logsByHash.get(tx.hash)
      if (!logs) continue
      const ops = decodeHandleOps(tx, { logs })?.filter((op) =>
        isAddressEqual(op.sender, accountAddress),
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
  }, [accountAddress, allMined, userOpLogs])

  // Transactions someone else paid for on the account's behalf.
  const sponsoredHashes = useMemo(() => {
    const set = new Set<string>()
    authorizationTxs.forEach((tx, i) => {
      const authorities = authorityResults[i]?.data
      if (
        authorities?.some((a) => a?.toLowerCase() === accountLower) &&
        tx.from.toLowerCase() !== accountLower
      )
        set.add(tx.hash)
    })
    for (const tx of allMined) {
      if (userOpTxs.has(tx.hash) && tx.from.toLowerCase() !== accountLower)
        set.add(tx.hash)
    }
    return set
  }, [accountLower, allMined, authorizationTxs, authorityResults, userOpTxs])

  const transactions = useMemo((): ActivityItem[] => {
    const matches = (tx: Transaction) =>
      tx.from.toLowerCase() === accountLower ||
      (tx.to || '').toLowerCase() === accountLower ||
      sponsoredHashes.has(tx.hash) ||
      userOpTxs.has(tx.hash)

    return [
      ...(pendingTransactions ?? [])
        .filter(matches)
        .map((transaction) => ({ transaction, status: 'pending' as const })),
      ...allMined.filter(matches).map((transaction) => {
        const userOps = userOpTxs.get(transaction.hash)
        return {
          transaction,
          status: 'mined' as const,
          ...(userOps && { userOps }),
        }
      }),
    ]
  }, [accountLower, pendingTransactions, allMined, sponsoredHashes, userOpTxs])

  return {
    accountLower,
    isFetched,
    isFetchingNextPage,
    query,
    sponsoredHashes,
    transactions,
  }
}
