import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { Address, Transaction } from 'viem'

import {
  type ActivityItem,
  activityFromBlock,
  userOpsByTransaction,
} from '~/utils/activity'

import { authoritiesQueryOptions } from './useAuthorities'
import { useInfiniteBlockTransactions } from './useInfiniteBlockTransactions'
import { usePendingTransactions } from './usePendingTransactions'
import { useUserOpLogs } from './useUserOpLogs'

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

  // The user-operation search covers the blocks the loaded pages cover: All
  // activity's "Load more" is what reaches older ones.
  const fromBlock = useMemo(
    () =>
      isFetched
        ? activityFromBlock({
            transactions: allMined,
            hasNextPage: Boolean(hasNextPage),
          })
        : undefined,
    [allMined, hasNextPage, isFetched],
  )
  const { data: userOpLogs } = useUserOpLogs({
    sender: accountAddress,
    fromBlock,
  })

  // The loaded transactions that ran the account's user operations.
  const userOpTxs = useMemo(
    () =>
      userOpsByTransaction({
        account: accountAddress,
        transactions: allMined,
        logs: userOpLogs ?? [],
      }),
    [accountAddress, allMined, userOpLogs],
  )

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
