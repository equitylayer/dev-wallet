import { useSyncExternalStore } from 'react'
import { type Address, isAddressEqual } from 'viem'

import { classifyCode } from '~/smart/kernel'
import { defaultMode } from '~/smart/mode-rules'
import type { AccountMode } from '~/smart/types'
import {
  accountModesStore,
  modeKey,
  useAccountStore,
  useNetworkStore,
} from '~/zustand'

import { useBytecode } from './useBytecode'

/**
 * An account's mode as the background resolves it, before any preview: the
 * stored one, else the default for its code. `undefined` while that code
 * loads, or for an address the wallet doesn't hold on this network.
 *
 * TODO(Task 13): fold into `useAccountMode` (src/hooks/useAccountMode.ts).
 */
export function useResolvedMode(
  address: Address | undefined,
): AccountMode | undefined {
  const { network } = useNetworkStore()
  const { accounts } = useAccountStore()
  const account = address
    ? accounts.find(
        (a) =>
          a.rpcUrl === network.rpcUrl && isAddressEqual(a.address, address),
      )
    : undefined
  // Read directly: the tracked store hook can't follow dotted keys.
  const stored = useSyncExternalStore(accountModesStore.subscribe, () =>
    account
      ? accountModesStore.getState().modes[
          modeKey(network.rpcUrl, account.address)
        ]
      : undefined,
  )
  const impersonated = account?.impersonate === true
  const { data: code, isSuccess } = useBytecode({ address: account?.address })
  if (!account) return undefined
  if (stored) return stored
  // Only an impersonated account's default depends on its code.
  if (impersonated && !isSuccess) return undefined
  return defaultMode({ impersonated, onchain: classifyCode(code ?? '0x') })
}
