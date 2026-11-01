import { useForm } from 'react-hook-form'

import * as Form from '~/components/form'
import { Button, Inline } from '~/design-system'
import { useImportAccount } from '~/hooks/useImportAccount'

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
  const importAccount = useImportAccount()
  const { handleSubmit, register, reset } = useForm<{ addressOrEns: string }>({
    defaultValues: {
      addressOrEns: '',
    },
  })

  const submit = handleSubmit(async ({ addressOrEns }) => {
    reset()
    if (await importAccount(addressOrEns, { setActive })) onDone?.()
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
