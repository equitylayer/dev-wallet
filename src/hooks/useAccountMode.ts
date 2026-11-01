import { useSyncExternalStore } from 'react'
import type { Address } from 'viem'

import { getMessenger } from '~/messengers'
import { queryClient } from '~/react-query'
import { classifyCode } from '~/smart/kernel'
import { defaultMode } from '~/smart/mode-rules'
import type { AccountMode, OnchainKind } from '~/smart/types'
import { type AccountModeAction, modeChangeError } from '~/utils/accountMode'
import {
  accountModesStore,
  modeKey,
  useAccountStore,
  useNetworkStore,
} from '~/zustand'

import { getBytecodeQueryKey, useBytecode } from './useBytecode'
import { useClient } from './useClient'
import { getEntryPointNonceQueryKey } from './useEntryPointNonce'
import { getSmartStatusQueryKey } from './useSmartStatus'

// The pure wording lives apart, so tests import it without the stores.
export { modeLabel } from '~/utils/accountMode'
export type { AccountModeAction }

const backgroundMessenger = getMessenger('background:wallet')

export type UseAccountMode = {
  /**
   * The account's mode as the background resolves it: the stored one, else
   * the default for its code. `undefined` while that code loads, or for an
   * address the wallet doesn't hold on this network.
   */
  mode: AccountMode | undefined
  /** What its code on the node is; `undefined` while it loads. */
  onchain: OnchainKind | undefined
  /**
   * Asks the background, the only writer of modes, to change the account.
   * Resolves once the node is reconciled and the code read again; rejects
   * with a message to show when the change failed or didn't take.
   */
  set(action: AccountModeAction): Promise<void>
}

/** An account's mode on the active network, and the way to change it. */
export function useAccountMode(address: Address): UseAccountMode {
  const { network } = useNetworkStore()
  const { accounts } = useAccountStore()
  const client = useClient()
  const { rpcUrl } = network
  // Compared as text: a route's address may not be a valid one.
  const account = accounts.find(
    (a) =>
      a.rpcUrl === rpcUrl && a.address.toLowerCase() === address.toLowerCase(),
  )
  // Read directly: the tracked store hook can't follow dotted keys.
  const stored = useSyncExternalStore(accountModesStore.subscribe, () =>
    account
      ? accountModesStore.getState().modes[modeKey(rpcUrl, account.address)]
      : undefined,
  )
  const impersonated = account?.impersonate === true
  const { data: code, isSuccess } = useBytecode({ address: account?.address })
  const onchain = isSuccess ? classifyCode(code ?? '0x') : undefined

  const mode = (() => {
    if (!account) return undefined
    if (stored) return stored
    // Only an impersonated account's default depends on its code.
    if (impersonated && !onchain) return undefined
    return defaultMode({ impersonated, onchain: onchain ?? { kind: 'eoa' } })
  })()

  async function set(action: AccountModeAction): Promise<void> {
    if (!account) {
      throw new Error(`${address} isn't an account on this network.`)
    }
    try {
      const result = await backgroundMessenger.send('setAccountMode', {
        rpcUrl,
        address: account.address,
        action,
      })
      const error = modeChangeError(action, result)
      if (error) throw new Error(error)
    } finally {
      // Even a failed change may have written code.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: getBytecodeQueryKey([client.key]),
        }),
        queryClient.invalidateQueries({
          queryKey: getEntryPointNonceQueryKey([client.key]),
        }),
        queryClient.invalidateQueries({
          queryKey: getSmartStatusQueryKey([rpcUrl]),
        }),
      ])
    }
  }

  return { mode, onchain, set }
}
