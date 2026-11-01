import { queryOptions, useQuery } from '@tanstack/react-query'
import type { Address, Hash, SignedAuthorizationList } from 'viem'
import { recoverAuthorizationAddress } from 'viem/utils'

import { createQueryKey } from '~/react-query'

type AuthorizationTransaction = {
  hash: Hash
  authorizationList?: SignedAuthorizationList | undefined
}

export const getAuthoritiesQueryKey = createQueryKey<
  'authorities',
  [hash: Hash]
>('authorities')

/**
 * Who signed each authorization of an EIP-7702 transaction, in order, or
 * `null` for one whose signature doesn't recover. The authority isn't stored
 * on chain, so it is recovered from the signature; signatures are
 * deterministic, so the result is cached forever.
 */
export function authoritiesQueryOptions(tx: AuthorizationTransaction) {
  return queryOptions({
    queryKey: getAuthoritiesQueryKey([tx.hash]),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    queryFn: () =>
      Promise.all(
        (tx.authorizationList ?? []).map(
          (authorization): Promise<Address | null> =>
            recoverAuthorizationAddress({ authorization }).catch(() => null),
        ),
      ),
  })
}

export function useAuthorities(tx: AuthorizationTransaction) {
  return useQuery({
    ...authoritiesQueryOptions(tx),
    enabled: Boolean(tx.authorizationList?.length),
  })
}
