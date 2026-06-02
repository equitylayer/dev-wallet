import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { type Address, isAddress } from 'viem'

import * as Form from '~/components/form'
import { Button, Inline } from '~/design-system'
import { useAccountTokens } from '~/hooks/useAccountTokens'

export function ImportToken({ accountAddress }: { accountAddress: Address }) {
    const { addToken } = useAccountTokens({ address: accountAddress })

    const { handleSubmit, register, reset } = useForm<{ address: string }>({
        defaultValues: {
            address: '',
        },
    })

    const submit = handleSubmit(async ({ address }) => {
        try {
            if (!accountAddress || !address || !isAddress(address)) {
                toast.error('Invalid token address')
                reset()
                return
            }

            addToken({ tokenAddress: address })
        } finally {
            reset()
        }
    })

    return (
        <Form.Root onSubmit={submit} style={{ width: '100%' }}>
            <Inline gap="4px" wrap={false}>
                <Form.InputField
                    height="24px"
                    hideLabel
                    label="Import token address"
                    placeholder="Import token address"
                    register={register('address')}
                />
                <Button height="24px" variant="stroked fill" width="fit" type="submit">
                    Import
                </Button>
            </Inline>
        </Form.Root>
    )
}
