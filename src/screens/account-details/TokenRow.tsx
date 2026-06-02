import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { type Address, formatUnits } from 'viem'

import { Tooltip } from '~/components'
import { Spinner } from '~/components/svgs'
import {
    Box,
    Button,
    Column,
    Columns,
    Inline,
    Inset,
    Separator,
    Stack,
    Text,
} from '~/design-system'
import { useAccountTokens } from '~/hooks/useAccountTokens'
import { useBalance } from '~/hooks/useBalance'
import { useErc20Balance } from '~/hooks/useErc20Balance'
import { useErc20Metadata } from '~/hooks/useErc20Metadata'
import { truncate } from '~/utils'

function formatBalance(
    balance: bigint,
    decimals: number,
    maxDecimals = 5,
): string {
    const formatted = formatUnits(balance, decimals)
    const [whole, decimal] = formatted.split('.')
    if (!decimal) return whole
    const truncated = decimal.slice(0, maxDecimals)
    const trimmed = truncated.replace(/0+$/, '')
    return trimmed ? `${whole}.${trimmed}` : whole
}

interface TokenRowProps {
    accountAddress: Address
    tokenAddress?: Address
}

export function TokenRow({ accountAddress, tokenAddress }: TokenRowProps) {
    const navigate = useNavigate()
    const isNative = !tokenAddress

    const { data: nativeBalance } = useBalance({
        address: accountAddress,
    })

    const { removeToken, hideToken } = useAccountTokens({
        address: accountAddress,
    })

    const { data: erc20Balance, error: balanceError } = useErc20Balance({
        address: accountAddress,
        tokenAddress: tokenAddress!,
    })

    const { data: metadata, error: metadataError } = useErc20Metadata({
        tokenAddress: tokenAddress!,
    })

    useEffect(() => {
        if (!tokenAddress) return
        if (balanceError || metadataError) removeToken({ tokenAddress })
    }, [metadataError, balanceError, tokenAddress, removeToken])

    const balance = isNative ? nativeBalance : erc20Balance
    const decimals = isNative ? 18 : metadata?.decimals ?? 0
    const symbol = isNative ? 'ETH' : metadata?.symbol ?? '???'
    const name = isNative ? 'Ethereum' : metadata?.name ?? 'Token'
    const isLoading = !isNative && !metadata

    return (
        <>
            <Inset vertical="12px">
                <Box position="relative">
                    <Columns alignVertical="center" alignHorizontal="justify" gap="8px">
                        <Column>
                            <Stack gap="4px">
                                {isLoading ? (
                                    <Inline alignVertical="center" gap="4px">
                                        <Spinner size="11px" />
                                        <Text color="text/tertiary" size="12px">
                                            Importing...
                                        </Text>
                                    </Inline>
                                ) : (
                                    <>
                                        <Tooltip label={name}>
                                            <Text family="numeric" size="14px">
                                                {symbol}
                                            </Text>
                                        </Tooltip>
                                        {isNative ? (
                                            <Tooltip label="Gas token">
                                                <Text family="address" color="text/tertiary" size="9px">
                                                    Gas token
                                                </Text>
                                            </Tooltip>
                                        ) : (
                                            <Inline gap="4px" alignVertical="center">
                                                <Tooltip label={tokenAddress}>
                                                    <Text
                                                        family="address"
                                                        color="text/tertiary"
                                                        size="9px"
                                                    >
                                                        {truncate(tokenAddress!, { start: 4, end: 3 })}
                                                    </Text>
                                                </Tooltip>
                                                <Button.Copy
                                                    height="16px"
                                                    text={tokenAddress!}
                                                    variant="ghost primary"
                                                />
                                                <Button.Symbol
                                                    label="Hide token"
                                                    symbol="trash"
                                                    height="16px"
                                                    variant="ghost red"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        hideToken({ tokenAddress: tokenAddress! })
                                                    }}
                                                />
                                            </Inline>
                                        )}
                                    </>
                                )}
                            </Stack>
                        </Column>
                        <Column width="content">
                            <Text align="right" family="numeric" size="12px">
                                {formatBalance(balance ?? 0n, decimals)}
                            </Text>
                        </Column>
                        <Column width="content">
                            <Button.Symbol
                                label="Send"
                                symbol="paperplane"
                                height="36px"
                                variant="ghost blue"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    navigate(
                                        tokenAddress
                                            ? `/transfer/${accountAddress}/${tokenAddress}`
                                            : `/transfer/${accountAddress}`,
                                    )
                                }}
                            />
                        </Column>
                    </Columns>
                </Box>
            </Inset>
            <Box marginHorizontal="-8px">
                <Separator />
            </Box>
        </>
    )
}
