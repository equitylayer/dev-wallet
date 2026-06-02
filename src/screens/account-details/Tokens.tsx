import type { Address } from 'viem'

import {
    Bleed,
    Box,
    Column,
    Columns,
    Inset,
    Separator,
    Text,
} from '~/design-system'
import { useAccountTokens } from '~/hooks/useAccountTokens'

import { ImportToken } from './ImportToken'
import { TokenRow } from './TokenRow'

export function Tokens({ accountAddress }: { accountAddress: Address }) {
    const { tokens } = useAccountTokens({ address: accountAddress })

    if (!accountAddress) return null
    return (
        <Inset vertical="8px">
            <ImportToken accountAddress={accountAddress} />
            <Box style={{ height: '4px' }} />
            <Box style={{ height: '24px' }}>
                <Columns alignHorizontal="justify" gap="8px">
                    <Column alignVertical="center">
                        <Text color="text/tertiary" size="9px" wrap={false}>
                            TOKEN
                        </Text>
                    </Column>
                    <Column alignVertical="center" width="content">
                        <Text align="right" color="text/tertiary" size="9px" wrap={false}>
                            BALANCE
                        </Text>
                    </Column>
                    <Column alignVertical="center" width="content">
                        <Text align="right" color="text/tertiary" size="9px" wrap={false}>
                            ACTIONS
                        </Text>
                    </Column>
                </Columns>
            </Box>
            <Bleed horizontal="-8px">
                <Separator />
            </Bleed>
            {/* Native ETH */}
            <TokenRow accountAddress={accountAddress} />
            {/* TODO: Handle empty state. */}
            {tokens?.map((token) =>
                token.visible ? (
                    <TokenRow
                        accountAddress={accountAddress}
                        tokenAddress={token.address}
                        key={token.address}
                    />
                ) : null,
            )}
        </Inset>
    )
}
