import * as Tabs_ from '@radix-ui/react-tabs'

import { Bleed, Box, Column, Columns, Separator, Text } from '~/design-system'

import * as styles from './TabsList.css'

type TabItem = { label: string; value: string }

type TabsListProps = {
    items: TabItem[]
    onSelect?: (item: TabItem) => void
}

export function TabsList({ items, onSelect }: TabsListProps) {
    return (
        <>
            <Tabs_.List asChild>
                <div>
                    <Columns gap="0px" width="full">
                        {items.map((item) => (
                            <Column key={item.value}>
                                <Tabs_.Trigger asChild className={styles.tabTrigger} value={item.value}>
                                    <Box
                                        alignItems="center"
                                        justifyContent="center"
                                        cursor="pointer"
                                        display="flex"
                                        onClick={() => onSelect?.(item)}
                                        style={{ height: '32px' }}
                                        width="full"
                                    >
                                        <Text size="11px">{item.label}</Text>
                                    </Box>
                                </Tabs_.Trigger>
                            </Column>
                        ))}
                    </Columns>
                </div>
            </Tabs_.List>
            <Bleed horizontal="-8px">
                <Separator />
            </Bleed>
        </>
    )
}
