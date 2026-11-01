import { queryOptions, useQueries, useQuery } from '@tanstack/react-query'
import { type Address, type Client, getContract } from 'viem'

import { erc20Abi } from '~/constants'
import { createQueryKey } from '~/react-query'
import type { Client as WalletClient } from '~/viem'

import { useClient } from './useClient'

type UseErc20BalanceParameters = {
  address: Address
  tokenAddress: Address
}

export const getErc20BalanceQueryKey = createQueryKey<
  'erc20-balance',
  [key: Client['key'], args: UseErc20BalanceParameters]
>('erc20-balance')

export function getErc20BalanceQueryOptions(
  client: WalletClient,
  { address, tokenAddress }: UseErc20BalanceParameters,
) {
  return queryOptions({
    enabled: Boolean(address && tokenAddress),
    queryKey: getErc20BalanceQueryKey([client.key, { tokenAddress, address }]),
    async queryFn() {
      const contract = getContract({
        address: tokenAddress,
        abi: erc20Abi,
        client,
      })
      return contract.read.balanceOf([address])
    },
  })
}

export function useErc20BalanceQueryOptions({
  address,
  tokenAddress,
}: UseErc20BalanceParameters) {
  const client = useClient()
  return getErc20BalanceQueryOptions(client, { address, tokenAddress })
}

export function useErc20Balance({
  tokenAddress,
  address,
}: UseErc20BalanceParameters) {
  const queryOptions = useErc20BalanceQueryOptions({ tokenAddress, address })
  return useQuery(queryOptions)
}

// Module-level so its identity is stable and `useQueries` can memoize on it.
const combineBalances = (results: { data?: bigint }[]) =>
  results.map((result) => result.data)

/**
 * Balances of many tokens at once. Each uses the same query as
 * `useErc20Balance`, so rows and lists share one request per token.
 * `data[i]` is `undefined` until the i-th balance has loaded.
 */
export function useErc20Balances({
  address,
  tokenAddresses,
}: {
  address: Address
  tokenAddresses: Address[]
}) {
  const client = useClient()
  return useQueries({
    queries: tokenAddresses.map((tokenAddress) =>
      getErc20BalanceQueryOptions(client, { address, tokenAddress }),
    ),
    combine: combineBalances,
  })
}
