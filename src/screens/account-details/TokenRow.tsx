import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { type Address, formatUnits } from 'viem'

import { Spinner } from '~/components/svgs'
import { Box, Button, Inline, Text } from '~/design-system'
import { useAccountTokens } from '~/hooks/useAccountTokens'
import { useBalance } from '~/hooks/useBalance'
import { useErc20Balance } from '~/hooks/useErc20Balance'
import { useErc20Metadata } from '~/hooks/useErc20Metadata'
import { truncate } from '~/utils'

import * as styles from './TokenRow.css'

function formatBalance(
    balance: bigint,
    decimals: number,
    maxDecimals = 5,
): string {
    const formatted = formatUnits(balance, decimals)
    const [whole_, decimal] = formatted.split('.')
    const whole = BigInt(whole_).toLocaleString('en-US')
    if (!decimal) return whole
    const truncated = decimal.slice(0, maxDecimals)
    const trimmed = truncated.replace(/0+$/, '')
    return trimmed ? `${whole}.${trimmed}` : whole
}

interface TokenRowProps {
    accountAddress: Address
    tokenAddress?: Address
    /** Bleed to the panel edge from inside an 8px-inset container. */
    bleed?: boolean
}

export function TokenRow({ accountAddress, tokenAddress, bleed }: TokenRowProps) {
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
    const symbol = isNative ? 'ETH' : metadata?.symbol || 'No symbol'
    const name = isNative ? 'Ethereum' : metadata?.name || ''
    const isLoading = !isNative && !metadata

    return (
        <Box className={[styles.row, bleed && styles.bleed]}>
            <Box className={styles.main}>
                {isLoading ? (
                    <Inline alignVertical="center" gap="4px">
                        <Spinner size="11px" />
                        <Text color="text/tertiary" size="12px">
                            Importing…
                        </Text>
                    </Inline>
                ) : (
                    <>
                        <Box title={name || undefined}>
                            <Text size="13px" weight="medium" wrap={false}>
                                {symbol}
                            </Text>
                        </Box>
                        <Box className={styles.meta}>
                            {isNative ? (
                                <Text color="text/tertiary" size="12px" wrap={false}>
                                    Gas token
                                </Text>
                            ) : (
                                <>
                                    {/* The name gives way first; the address always survives. */}
                                    {name && (
                                        <Box className={styles.metaText} title={name}>
                                            <Text
                                                color="text/tertiary"
                                                family="mono"
                                                size="12px"
                                                wrap={false}
                                            >
                                                {`${name} ·`}
                                            </Text>
                                        </Box>
                                    )}
                                    <Box className={styles.end} title={tokenAddress}>
                                        <Text
                                            color="text/tertiary"
                                            family="mono"
                                            size="12px"
                                            wrap={false}
                                        >
                                            {truncate(tokenAddress!, { start: 6, end: 4 })}
                                        </Text>
                                    </Box>
                                </>
                            )}
                            {!isNative && (
                                <Box className={styles.tools}>
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
                                </Box>
                            )}
                        </Box>
                    </>
                )}
            </Box>
            <Box className={styles.end}>
                <Text align="right" family="mono" size="13px" tabular wrap={false}>
                    {formatBalance(balance ?? 0n, decimals)}
                </Text>
            </Box>
            <Box className={styles.end}>
                <Button.Symbol
                    label={`Send ${symbol}`}
                    symbol="paperplane"
                    height="24px"
                    variant="ghost primary"
                    onClick={(e) => {
                        e.stopPropagation()
                        navigate(
                            tokenAddress
                                ? `/transfer/${accountAddress}/${tokenAddress}`
                                : `/transfer/${accountAddress}`,
                        )
                    }}
                />
            </Box>
        </Box>
    )
}
