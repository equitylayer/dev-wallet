import { useQuery } from '@tanstack/react-query'

import { getMessenger } from '~/messengers'
import { createQueryKey, queryClient } from '~/react-query'
import type { AaStatus } from '~/smart/setup'
import { useNetworkStore } from '~/zustand'

import { getBytecodeQueryKey } from './useBytecode'
import { useClient } from './useClient'

const backgroundMessenger = getMessenger('background:wallet')

/** Each network's last status as this page saw it, to spot a change. */
const lastSeen = new Map<string, string>()

export const getSmartStatusQueryKey = createQueryKey<
  'smart-status',
  [rpcUrl: string]
>('smart-status')

/**
 * Whether smart accounts work on the active network: `{ ok: false }` lists
 * the AA addresses holding code DevWallet won't overwrite. Asking reconciles
 * a network the background hasn't reconciled yet, which can delegate its
 * accounts, so their code is read again after the first status of a network,
 * and after any change; an unchanged status reads nothing.
 */
export function useSmartStatus() {
  const { network } = useNetworkStore()
  const client = useClient()
  const { rpcUrl } = network

  return useQuery({
    queryKey: getSmartStatusQueryKey([rpcUrl]),
    async queryFn(): Promise<AaStatus> {
      const status = await backgroundMessenger.send('smartStatus', { rpcUrl })
      const seen = JSON.stringify(status)
      if (lastSeen.get(rpcUrl) !== seen) {
        lastSeen.set(rpcUrl, seen)
        void queryClient.invalidateQueries({
          queryKey: getBytecodeQueryKey([client.key]),
        })
      }
      return status
    },
    // Asked afresh on each screen, never persisted.
    gcTime: 0,
  })
}
