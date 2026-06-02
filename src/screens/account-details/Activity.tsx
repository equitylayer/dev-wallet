import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import { type Address, formatEther, type Transaction } from 'viem'
import { recoverAuthorizationAddress } from 'viem/utils'

import { LoadMore, Tooltip, useVirtualList } from '~/components'
import {
    Box,
    Column,
    Columns,
    Inline,
    Inset,
    Separator,
    SFSymbol,
    Stack,
    Text,
} from '~/design-system'
import { useInfiniteBlockTransactions } from '~/hooks/useInfiniteBlockTransactions'
import { usePendingTransactions } from '~/hooks/usePendingTransactions'

const numberIntl4SigFigs = new Intl.NumberFormat('en-US', {
    maximumSignificantDigits: 4,
})

export function Activity({ accountAddress }: { accountAddress: Address }) {
    const { data: pendingTransactions } = usePendingTransactions()

    const query = useInfiniteBlockTransactions()
    const {
        data: infiniteBlockTransactions,
        isFetched,
        isFetchingNextPage,
    } = query

    const accountLower = accountAddress.toLowerCase()

    const allMined = useMemo(
        () =>
            (infiniteBlockTransactions?.pages.flat() as Transaction[] | undefined) ??
            [],
        [infiniteBlockTransactions],
    )

    // EIP-7702 txs carry authorizations signed by other EOAs. The authority
    // isn't stored explicitly — we have to ecrecover it from each signature
    // — so we cache the result per tx hash (forever, since signatures are
    // deterministic).
    const authorizationTxs = useMemo(
        () =>
            allMined.filter(
                (tx) => tx.type === 'eip7702' && (tx.authorizationList?.length ?? 0) > 0,
            ),
        [allMined],
    )
    const authorityResults = useQueries({
        queries: authorizationTxs.map((tx) => ({
            queryKey: ['authority-recovery', tx.hash] as const,
            staleTime: Number.POSITIVE_INFINITY,
            gcTime: Number.POSITIVE_INFINITY,
            queryFn: async () => {
                const authorities = await Promise.all(
                    (tx.authorizationList ?? []).map((authorization) =>
                        recoverAuthorizationAddress({ authorization }),
                    ),
                )
                return authorities.map((a: string) => a.toLowerCase())
            },
        })),
    })
    const sponsoredHashes = useMemo(() => {
        const set = new Set<string>()
        authorizationTxs.forEach((tx, i) => {
            const authorities = authorityResults[i]?.data
            if (
                authorities?.includes(accountLower) &&
                tx.from.toLowerCase() !== accountLower
            )
                set.add(tx.hash)
        })
        return set
    }, [accountLower, authorizationTxs, authorityResults])

    const transactions = useMemo(() => {
        const matches = (tx: Transaction) =>
            tx.from.toLowerCase() === accountLower ||
            (tx.to || '').toLowerCase() === accountLower ||
            sponsoredHashes.has(tx.hash)

        return [
            ...(pendingTransactions ?? [])
                .filter(matches)
                .map((transaction) => ({ transaction, status: 'pending' as const })),
            ...allMined
                .filter(matches)
                .map((transaction) => ({ transaction, status: 'mined' as const })),
        ]
    }, [accountLower, pendingTransactions, allMined, sponsoredHashes])

    const isEmpty = isFetched && transactions.length === 0

    const VirtualList = useVirtualList({
        layout: useMemo(
            () => [
                { size: 24, sticky: true, type: 'header' },
                isEmpty ? { size: 40, type: 'empty' } : undefined,
                ...transactions.map(
                    (_, index) =>
                        ({
                            index,
                            size: 40,
                            type: 'item',
                        }) as const,
                ),
                { size: 40, type: 'load-more' },
            ],
            [isEmpty, transactions.length],
        ),
    })

    return (
        <VirtualList.Wrapper marginHorizontal="-8px">
            <VirtualList>
                {({ getLayoutItem, items }) =>
                    items.map((item) => {
                        const layoutItem = getLayoutItem(item.index)

                        if (layoutItem.type === 'header')
                            return (
                                <VirtualList.Item {...item}>
                                    <Box
                                        display="flex"
                                        alignItems="center"
                                        height="full"
                                        paddingHorizontal="8px"
                                        width="full"
                                    >
                                        <Columns alignHorizontal="justify" gap="4px" width="full">
                                            <Column alignVertical="center">
                                                <Text color="text/tertiary" size="9px" wrap={false}>
                                                    BLOCK
                                                </Text>
                                            </Column>
                                            <Column alignVertical="center">
                                                <Text color="text/tertiary" size="9px" wrap={false}>
                                                    COUNTERPARTY
                                                </Text>
                                            </Column>
                                            <Column alignVertical="center">
                                                <Text
                                                    align="right"
                                                    color="text/tertiary"
                                                    size="9px"
                                                    wrap={false}
                                                >
                                                    VALUE
                                                </Text>
                                            </Column>
                                        </Columns>
                                    </Box>
                                    <Separator />
                                </VirtualList.Item>
                            )

                        if (layoutItem.type === 'empty')
                            return (
                                <VirtualList.Item {...item}>
                                    <Box
                                        display="flex"
                                        height="full"
                                        padding="8px"
                                        paddingVertical="12px"
                                    >
                                        <Text color="text/secondary" size="14px">
                                            No activity yet.
                                        </Text>
                                    </Box>
                                </VirtualList.Item>
                            )

                        if (layoutItem.type === 'load-more')
                            return (
                                <VirtualList.Item {...item}>
                                    <LoadMore query={query}>
                                        {isFetchingNextPage && (
                                            <Inset space="8px">
                                                <Text color="text/tertiary">Loading...</Text>
                                            </Inset>
                                        )}
                                    </LoadMore>
                                </VirtualList.Item>
                            )

                        const { transaction, status } =
                        transactions[layoutItem.index ?? 0] || {}
                        if (!transaction) return
                        const isSponsored = sponsoredHashes.has(transaction.hash)
                        const isOutgoing =
                            isSponsored || transaction.from.toLowerCase() === accountLower
                        const counterparty = isOutgoing ? transaction.to : transaction.from
                        return (
                            <VirtualList.Item {...item}>
                                <VirtualList.Link to={`/transaction/${transaction.hash}`}>
                                    <Box marginHorizontal="-8px">
                                        <Separator />
                                    </Box>
                                    <Box
                                        backgroundColor={{ hover: 'surface/fill/quarternary' }}
                                        paddingHorizontal="8px"
                                        paddingVertical="12px"
                                        height="full"
                                    >
                                        <Columns gap="6px" alignVertical="center">
                                            <Inline alignVertical="center" gap="4px" wrap={false}>
                                                <SFSymbol
                                                    color={
                                                        isOutgoing ? 'surface/red' : 'surface/green'
                                                    }
                                                    size="11px"
                                                    symbol={isOutgoing ? 'minus' : 'plus'}
                                                    weight="semibold"
                                                />
                                                <Text family="numeric" size="12px">
                                                    {transaction.blockNumber?.toString() ?? '—'}
                                                </Text>
                                                {status === 'pending' && (
                                                    <SFSymbol
                                                        color="text/tertiary"
                                                        size="11px"
                                                        symbol="clock"
                                                        weight="semibold"
                                                    />
                                                )}
                                            </Inline>
                                            <Column alignVertical="center">
                                                <Stack gap="2px">
                                                    {counterparty ? (
                                                        <Box title={counterparty}>
                                                            <Text.Truncated family="address" size="12px">
                                                                {counterparty}
                                                            </Text.Truncated>
                                                        </Box>
                                                    ) : (
                                                        <Text
                                                            color="text/tertiary"
                                                            size="11px"
                                                            wrap={false}
                                                        >
                                                            Deploy Contract
                                                        </Text>
                                                    )}
                                                    {isSponsored && (
                                                        <Tooltip
                                                            label={`Sponsored by ${transaction.from}`}
                                                        >
                                                            <Text
                                                                color="surface/green"
                                                                size="9px"
                                                                wrap={false}
                                                            >
                                                                SPONSORED
                                                            </Text>
                                                        </Tooltip>
                                                    )}
                                                </Stack>
                                            </Column>
                                            <Column alignVertical="center">
                                                <Text
                                                    align="right"
                                                    family="numeric"
                                                    wrap={false}
                                                    size="12px"
                                                    width="full"
                                                >
                                                    {numberIntl4SigFigs.format(
                                                        Number(formatEther(transaction.value ?? 0n)),
                                                    )}{' '}
                                                    <Text color="text/tertiary">ETH</Text>
                                                </Text>
                                            </Column>
                                        </Columns>
                                    </Box>
                                </VirtualList.Link>
                            </VirtualList.Item>
                        )
                    })
                }
            </VirtualList>
        </VirtualList.Wrapper>
    )
}
