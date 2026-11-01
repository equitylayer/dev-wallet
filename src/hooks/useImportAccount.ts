import { toast } from 'sonner'
import { type Address, isAddress } from 'viem'

import { isDomain } from '~/utils'
import { useAccountStore, useNetworkStore } from '~/zustand'

import { useClient } from './useClient'
import { useSetAccount } from './useSetAccount'

/** A full address or an ENS-style name: something that can be impersonated. */
export function isImportable(value: string) {
  return isAddress(value) || isDomain(value)
}

/**
 * Impersonate an address or ENS name on the current node. Resolves to true
 * once the account exists, whether it was just added or already known.
 */
export function useImportAccount() {
  const {
    network: { rpcUrl },
  } = useNetworkStore()
  const client = useClient()
  const { mutateAsync: setAccount } = useSetAccount()
  const { accounts, switchAccount, upsertAccount, removeAccount } =
    useAccountStore()

  return async (
    addressOrEns: string,
    { setActive }: { setActive?: boolean } = {},
  ) => {
    const existing = accounts.find(
      (account) =>
        account.displayName === addressOrEns ||
        account.address.toLowerCase() === addressOrEns.toLowerCase(),
    )
    if (existing) {
      if (setActive) {
        switchAccount(existing.key)
        return true
      }
      toast(`"${addressOrEns}" is already imported.`)
      return false
    }

    const isDomain_ = isDomain(addressOrEns)
    const isAddress_ = isAddress(addressOrEns)

    const loadingAccount = {
      address: '' as Address,
      key: addressOrEns,
      rpcUrl,
      state: 'loading',
      type: 'json-rpc',
    } as const

    try {
      if (!isDomain_ && !isAddress_) throw new Error()

      if (isDomain_) upsertAccount({ account: loadingAccount })

      const address = isAddress_
        ? addressOrEns
        : await client.getEnsAddress({ name: addressOrEns })
      if (!address) throw new Error()

      await setAccount({
        account: {
          address,
          displayName: isDomain_ ? addressOrEns : undefined,
          impersonate: true,
          rpcUrl,
          type: 'json-rpc',
        },
        key: addressOrEns,
        setActive,
      })
      return true
    } catch {
      if (isDomain_) removeAccount({ account: loadingAccount })
      toast.error(`"${addressOrEns}" is not a valid address or ENS name.`)
      return false
    }
  }
}
