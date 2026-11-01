import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { entryPoint07Abi } from 'viem/account-abstraction'

import { createQueryKey } from '~/react-query'
import { ENTRY_POINT_07 } from '~/smart/constants'
import type { Client } from '~/viem'

import { useClient } from './useClient'

type UseEntryPointNonceParameters = {
  address?: Address
  enabled?: boolean
}

export const getEntryPointNonceQueryKey = createQueryKey<
  'entry-point-nonce',
  [key: Client['key'], deps: { address?: Address }]
>('entry-point-nonce')

/**
 * The account's next user-operation nonce at the EntryPoint v0.7 (key 0, the
 * one DevWallet's user operations use).
 */
export function useEntryPointNonce({
  address,
  enabled = true,
}: UseEntryPointNonceParameters) {
  const client = useClient()
  return useQuery({
    enabled: enabled && Boolean(address),
    queryKey: getEntryPointNonceQueryKey([client.key, { address }]),
    queryFn: () =>
      client.readContract({
        address: ENTRY_POINT_07,
        abi: entryPoint07Abi,
        functionName: 'getNonce',
        args: [address!, 0n],
      }),
  })
}
