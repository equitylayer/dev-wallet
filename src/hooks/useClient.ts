import { useMemo } from 'react'

import { getClient } from '~/viem'
import { useNetworkStore } from '~/zustand'

export function useClient({ rpcUrl }: { rpcUrl?: string } = {}) {
  const { network } = useNetworkStore()
  // The active network's chain id only applies to the active network's URL; a
  // probe of another URL falls back to the default.
  const chainId =
    (!rpcUrl || rpcUrl === network.rpcUrl) && network.chainId > 0
      ? network.chainId
      : undefined
  return useMemo(
    () => getClient({ rpcUrl: rpcUrl || network.rpcUrl, chainId }),
    [network.rpcUrl, rpcUrl, chainId],
  )
}
