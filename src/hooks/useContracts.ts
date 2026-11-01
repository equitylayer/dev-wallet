import { useCallback, useMemo } from 'react'

import { queryOptions, useQuery } from '@tanstack/react-query'
import { createQueryKey } from '~/react-query'
import type { Client } from '~/viem'
import {
  contractsStore as contractsStoreApi,
  networkStore,
  useContractsStore,
  useNetworkStore,
} from '~/zustand'
import { type ContractsActions, getContractsKey } from '~/zustand/contracts'
import { getContracts, runCoalesced } from '../actions/getContracts'
import { useBlock } from './useBlock'
import { useClient } from './useClient'

type UseContractsParameters = {
  enabled?: boolean
}

export const getContractsQueryKey = createQueryKey<
  'contracts',
  [key: Client['key']]
>('contracts')

export function useContractsQueryOptions({
  enabled = true,
}: UseContractsParameters = {}) {
  const { data: block } = useBlock()
  const { network } = useNetworkStore()
  const client = useClient()

  return queryOptions({
    staleTime: Number.POSITIVE_INFINITY,
    enabled: Boolean(
      enabled &&
        typeof block?.number === 'bigint' &&
        typeof network.forkBlockNumber === 'bigint' &&
        block.number > network.forkBlockNumber,
    ),
    queryKey: getContractsQueryKey([client.key]),
    async queryFn() {
      // One scan at a time per network. A scan that is already running is not
      // restarted by the next block: a single follow-up scan is queued, and it
      // reads the network and the scan cursor only once it starts.
      return runCoalesced(client.key, async () => {
        const { network: current } = networkStore.getState()
        if (current.rpcUrl !== client.key) return []
        if (typeof current.forkBlockNumber !== 'bigint') throw new Error()

        const key = { rpcUrl: current.rpcUrl }
        const { scanCursors, syncContracts } = contractsStoreApi.getState()
        const { contracts } = await getContracts(client, {
          fromBlock: current.forkBlockNumber + 1n,
          toBlock: 'latest',
          cursor: scanCursors[getContractsKey(key)],
          // Keep what was found even if the scan is interrupted before the end.
          onProgress: ({ contracts, cursor }) =>
            syncContracts(key, { contracts, cursor }),
        })
        return contracts
      })
    },
  })
}

export function useContracts({ enabled = true }: UseContractsParameters = {}) {
  const queryOptions = useContractsQueryOptions({ enabled })
  const contractsStore = useContractsStore()
  const { network } = useNetworkStore()

  const contracts = useMemo(
    () =>
      contractsStore.contracts[
        getContractsKey({
          rpcUrl: network.rpcUrl,
        })
      ] ?? [],
    [network.rpcUrl, contractsStore.contracts],
  )
  const addContract = useCallback(
    (args: Parameters<ContractsActions['addContract']>[1]) =>
      contractsStore.addContract({ rpcUrl: network.rpcUrl }, args),
    [network.rpcUrl, contractsStore.addContract],
  )
  const hideContract = useCallback(
    (args: Parameters<ContractsActions['hideContract']>[1]) =>
      contractsStore.hideContract({ rpcUrl: network.rpcUrl }, args),
    [network.rpcUrl, contractsStore.hideContract],
  )
  const removeContract = useCallback(
    (args: Parameters<ContractsActions['removeContract']>[1]) =>
      contractsStore.removeContract({ rpcUrl: network.rpcUrl }, args),
    [network.rpcUrl, contractsStore.removeContract],
  )
  const updateContract = useCallback(
    (args: Parameters<ContractsActions['updateContract']>[1]) =>
      contractsStore.updateContract({ rpcUrl: network.rpcUrl }, args),
    [network.rpcUrl, contractsStore.updateContract],
  )

  return Object.assign(useQuery(queryOptions), {
    addContract,
    contracts,
    hideContract,
    removeContract,
    updateContract,
  })
}
