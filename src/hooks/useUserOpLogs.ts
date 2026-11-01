import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'

import { createQueryKey } from '~/react-query'
import { ENTRY_POINT_07 } from '~/smart/constants'
import { USER_OPERATION_EVENT } from '~/smart/decode'
import type { Client } from '~/viem'

import { useClient } from './useClient'

export const getUserOpLogsQueryKey = createQueryKey<
  'user-op-logs',
  [key: Client['key'], sender: string, fromBlock: string]
>('user-op-logs')

/**
 * The EntryPoint v0.7's `UserOperationEvent` logs for operations `sender`
 * sent, from `fromBlock` to the latest block. Disabled while `fromBlock` is
 * unknown. `usePendingBlock` refetches it on each new block.
 */
export function useUserOpLogs({
  sender,
  fromBlock,
}: {
  sender: Address
  fromBlock: bigint | undefined
}) {
  const client = useClient()
  const senderKey = sender.toLowerCase()
  return useQuery({
    enabled: fromBlock !== undefined,
    queryKey: getUserOpLogsQueryKey([
      client.key,
      senderKey,
      String(fromBlock),
    ]),
    queryFn: () =>
      client.getLogs({
        address: ENTRY_POINT_07,
        event: USER_OPERATION_EVENT,
        args: { sender },
        fromBlock,
        toBlock: 'latest',
      }),
    // Refetched every block, and each range is a new key: none of it is worth
    // keeping once unused, or persisting (zero gcTime isn't dehydrated).
    gcTime: 0,
    // Loading older blocks widens the range: keep the rows already found,
    // but never another account's or network's.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === client.key &&
      previousQuery.queryKey[2] === senderKey
        ? previous
        : undefined,
  })
}
