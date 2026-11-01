import {
  type UseQueryResult,
  keepPreviousData,
  useQuery,
} from '@tanstack/react-query'
import { useEffect } from 'react'
import type { Address } from 'viem'

import { getMessenger } from '~/messengers'
import type { SendPreview } from '~/smart/preview'
import type { RpcCall } from '~/smart/types'
import type { SendMethod } from '~/utils/sendPreview'
import { useAccountStore, useNetworkStore } from '~/zustand'

import { usePendingBlock } from './usePendingBlock'

const backgroundMessenger = getMessenger('background:wallet')

/**
 * What sending `calls` would do (`previewSend`): the account's mode, the path
 * and payer, the cost, and the simulation of the calls as one execution. On
 * the active network, from `from` or the active account. Simulated again on
 * each new block; while different calls are simulated, the last preview stays
 * as `isPlaceholderData`.
 */
export function useSendPreview({
  from,
  calls,
  atomicRequired,
  method,
}: {
  from?: Address
  calls: RpcCall[]
  atomicRequired: boolean
  /** Only a `wallet_sendCalls` upgrades a plain-upgradable account first. */
  method: SendMethod
}): UseQueryResult<SendPreview> {
  const { network } = useNetworkStore()
  const { account } = useAccountStore()
  const sender = from ?? account?.address
  const { rpcUrl } = network

  const enabled = Boolean(rpcUrl && sender && calls.length > 0)
  const query = useQuery({
    enabled,
    queryKey: ['previewSend', rpcUrl, sender, method, atomicRequired, calls],
    queryFn: () =>
      backgroundMessenger.send('previewSend', {
        rpcUrl,
        from: sender!,
        calls,
        atomicRequired,
        method,
      }),
    // Never persisted, never reused across approvals.
    gcTime: 0,
    staleTime: 0,
    // While other calls are simulated, the last preview stays, marked as
    // placeholder; with nothing to simulate, none does.
    placeholderData: enabled ? keepPreviousData : undefined,
  })

  // The chain moved on: simulate again, keeping the preview on screen.
  const { data: block } = usePendingBlock()
  const blockNumber = block?.number
  // A failed refresh tries again too.
  const { refetch, isPending } = query
  useEffect(() => {
    if (!isPending) void refetch({ cancelRefetch: false })
  }, [blockNumber])

  return query
}
