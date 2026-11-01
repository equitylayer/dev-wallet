import { useState } from 'react'
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
import { useEmptyTokens } from '~/hooks/useEmptyTokens'

import * as homeStyles from '../account-home/account-home.css'
import { EmptyTokensToggle } from './EmptyTokensToggle'
import { ImportToken } from './ImportToken'
import { TokenRow } from './TokenRow'

export function Tokens({ accountAddress }: { accountAddress: Address }) {
    const { tokens } = useAccountTokens({ address: accountAddress })
    const [showEmpty, setShowEmpty] = useState(false)
    // Discovered tokens with a zero balance collapse behind a toggle.
    const { populated, empty } = useEmptyTokens({
        address: accountAddress,
        tokens: tokens?.filter((token) => token.visible) ?? [],
    })

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
            <TokenRow accountAddress={accountAddress} bleed />
            {/* TODO: Handle empty state. */}
            {populated.map((token) => (
                <TokenRow
                    bleed
                    accountAddress={accountAddress}
                    tokenAddress={token.address}
                    key={token.address}
                />
            ))}
            {empty.length > 0 && (
                <Box className={homeStyles.moreBleed}>
                    <EmptyTokensToggle
                        count={empty.length}
                        open={showEmpty}
                        onToggle={() => setShowEmpty((x) => !x)}
                    />
                </Box>
            )}
            {showEmpty &&
                empty.map((token) => (
                    <TokenRow
                        bleed
                        accountAddress={accountAddress}
                        tokenAddress={token.address}
                        key={token.address}
                    />
                ))}
        </Inset>
    )
}
