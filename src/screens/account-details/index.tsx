import * as Tabs from '@radix-ui/react-tabs'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { Address } from 'viem'

import { TabsContent, TabsList } from '~/components'
import {
    Box,
    Button,
    Inline,
    Inset,
    Separator,
    Stack,
    Text,
} from '~/design-system'
import { truncate } from '~/utils'

import { Activity } from './Activity'
import { Tokens } from './Tokens'

export default function AccountDetails() {
    const { address } = useParams()
    const [params, setParams] = useSearchParams({ tab: 'tokens' })
    const navigate = useNavigate()

    if (!address) return null
    return (
        <>
            <Box paddingHorizontal="4px" paddingVertical="12px">
                <Inline gap="4px" alignVertical="center" wrap={false}>
                    <Box
                        style={{
                            width: '24px',
                            height: '24px',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Button
                            type="button"
                            onClick={() => navigate(-1)}
                            variant="ghost primary"
                        >
                            ←
                        </Button>
                    </Box>
                    <Stack gap="2px" width="full">
                        <Text color="text/tertiary" size="9px">
                            Account
                        </Text>
                        <Text family="address" size="11px">
                            {truncate(address, { start: 5, end: 10 })}
                        </Text>
                    </Stack>
                </Inline>
            </Box>
            <Separator />
            <Inset horizontal="8px">
                <Stack gap="8px">
                    <Tabs.Root asChild value={params.get('tab')!}>
                        <Box display="flex" flexDirection="column" height="full">
                            <TabsList
                                items={[
                                    { label: 'Tokens', value: 'tokens' },
                                    { label: 'Activity', value: 'activity' },
                                    // { label: 'NFTs', value: 'nfts' },
                                ]}
                                onSelect={(item) => {
                                    setParams({ tab: item.value })
                                }}
                            />
                            <TabsContent inset={false} value="tokens">
                                <Tokens accountAddress={address as Address} />
                            </TabsContent>
                            <TabsContent inset={false} scrollable="auto" value="activity">
                                <Activity accountAddress={address as Address} />
                            </TabsContent>
                            {/*<TabsContent inset={false} value="nfts">*/}
                            {/*    <NFTs />*/}
                            {/*</TabsContent>*/}
                        </Box>
                    </Tabs.Root>
                </Stack>
            </Inset>
        </>
    )
}
