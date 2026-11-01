import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { Address, Transaction } from 'viem'
import { recoverAuthorizationAddress } from 'viem/utils'

import { useInfiniteBlockTransactions } from './useInfiniteBlockTransactions'
import { usePendingTransactions } from './usePendingTransactions'

/**
 * Pending and mined transactions that involve an account: sent from it, sent
 * to it, or sponsored on its behalf through an EIP-7702 authorization.
 */
export function useAccountActivity(accountAddress: Address) {
  const { data: pendingTransactions } = usePendingTransactions()

  const query = useInfiniteBlockTransactions()
  const {
    data: infiniteBlockTransactions,
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
  // isn't stored explicitly — we have to ecrecover it from each signature
  // — so we cache the result per tx hash (forever, since signatures are
  // deterministic).
  const authorizationTxs = useMemo(
    () =>
      allMined.filter(
        (tx) => tx.type === 'eip7702' && (tx.authorizationList?.length ?? 0) > 0,
      ),
    [allMined],
  )
  const authorityResults = useQueries({
    queries: authorizationTxs.map((tx) => ({
      queryKey: ['authority-recovery', tx.hash] as const,
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: Number.POSITIVE_INFINITY,
      queryFn: async () => {
        const authorities = await Promise.all(
          (tx.authorizationList ?? []).map((authorization) =>
            recoverAuthorizationAddress({ authorization }),
          ),
        )
        return authorities.map((a: string) => a.toLowerCase())
      },
    })),
  })
  const sponsoredHashes = useMemo(() => {
    const set = new Set<string>()
    authorizationTxs.forEach((tx, i) => {
      const authorities = authorityResults[i]?.data
      if (
        authorities?.includes(accountLower) &&
        tx.from.toLowerCase() !== accountLower
      )
        set.add(tx.hash)
    })
    return set
  }, [accountLower, authorizationTxs, authorityResults])

  const transactions = useMemo(() => {
    const matches = (tx: Transaction) =>
      tx.from.toLowerCase() === accountLower ||
      (tx.to || '').toLowerCase() === accountLower ||
      sponsoredHashes.has(tx.hash)

    return [
      ...(pendingTransactions ?? [])
        .filter(matches)
        .map((transaction) => ({ transaction, status: 'pending' as const })),
      ...allMined
        .filter(matches)
        .map((transaction) => ({ transaction, status: 'mined' as const })),
    ]
  }, [accountLower, pendingTransactions, allMined, sponsoredHashes])

  return {
    accountLower,
    isFetched,
    isFetchingNextPage,
    query,
    sponsoredHashes,
    transactions,
  }
}
