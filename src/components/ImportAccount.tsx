import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { type Address, isAddress } from 'viem'

import * as Form from '~/components/form'
import { Button, Inline } from '~/design-system'
import { useClient } from '~/hooks/useClient'
import { useSetAccount } from '~/hooks/useSetAccount'
import { isDomain } from '~/utils'
import { useAccountStore, useNetworkStore } from '~/zustand'

/**
 * Impersonate any address or ENS name on the current node. With `setActive`,
 * the new account becomes the one DevWallet acts as.
 */
export function ImportAccount({
  autoFocus,
  onDone,
  setActive,
  submitLabel = 'Import',
}: {
  autoFocus?: boolean
  onDone?: () => void
  setActive?: boolean
  submitLabel?: string
}) {
  const {
    network: { rpcUrl },
  } = useNetworkStore()
  const client = useClient()
  const { mutateAsync: setAccount } = useSetAccount()
  const { accounts, switchAccount, upsertAccount, removeAccount } =
    useAccountStore()

  const { handleSubmit, register, reset } = useForm<{ addressOrEns: string }>({
    defaultValues: {
      addressOrEns: '',
    },
  })

  const submit = handleSubmit(async ({ addressOrEns }) => {
    reset()

    const existing = accounts.find(
      (account) =>
        account.displayName === addressOrEns ||
        account.address.toLowerCase() === addressOrEns.toLowerCase(),
    )
    if (existing) {
      if (setActive) {
        switchAccount(existing.key)
        onDone?.()
      } else toast(`"${addressOrEns}" is already imported.`)
      return
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

      if (isDomain_)
        upsertAccount({
          account: loadingAccount,
        })

      const address = isAddress_
        ? addressOrEns
        : await client.getEnsAddress({ name: addressOrEns })
      const displayName = isDomain_ ? addressOrEns : undefined

      if (!address) throw new Error()

      await setAccount({
        account: {
          address,
          displayName,
          impersonate: true,
          rpcUrl,
          type: 'json-rpc',
        },
        key: addressOrEns,
        setActive,
      })
      onDone?.()
    } catch {
      if (isDomain_) removeAccount({ account: loadingAccount })
      toast.error(`"${addressOrEns}" is not a valid address or ENS name.`)
    }
  })

  return (
    <Form.Root onSubmit={submit} style={{ width: '100%' }}>
      <Inline gap="4px" wrap={false}>
        <Form.InputField
          autoFocus={autoFocus}
          height="24px"
          hideLabel
          label="Address or ENS name"
          placeholder="Address or ENS name to impersonate"
          register={register('addressOrEns', { required: true })}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onDone?.()
          }}
        />
        <Button height="24px" variant="stroked fill" width="fit" type="submit">
          {submitLabel}
        </Button>
      </Inline>
    </Form.Root>
  )
}
