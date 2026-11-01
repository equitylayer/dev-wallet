import { useQuery } from '@tanstack/react-query'

import { getMessenger } from '~/messengers'
import { createQueryKey, queryClient } from '~/react-query'
import type { AaStatus } from '~/smart/setup'
import { useNetworkStore } from '~/zustand'

import { getBytecodeQueryKey } from './useBytecode'
import { useClient } from './useClient'

const backgroundMessenger = getMessenger('background:wallet')

export const getSmartStatusQueryKey = createQueryKey<
  'smart-status',
  [rpcUrl: string]
>('smart-status')

/**
 * Whether smart accounts work on the active network: `{ ok: false }` lists
 * the AA addresses holding code DevWallet won't overwrite. Asking reconciles
 * a network the background hasn't reconciled yet, which can delegate its
 * accounts, so the accounts' code is read again after.
 */
export function useSmartStatus() {
  const { network } = useNetworkStore()
  const client = useClient()
  const { rpcUrl } = network

  return useQuery({
    queryKey: getSmartStatusQueryKey([rpcUrl]),
    async queryFn(): Promise<AaStatus> {
      const status = await backgroundMessenger.send('smartStatus', { rpcUrl })
      void queryClient.invalidateQueries({
        queryKey: getBytecodeQueryKey([client.key]),
      })
      return status
    },
    // Asked afresh on each screen, never persisted.
    gcTime: 0,
  })
}
