import * as Tabs from '@radix-ui/react-tabs'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { type Address, formatUnits, isAddress } from 'viem'

import { TabsContent, TabsList, Tooltip } from '~/components'
import * as Form from '~/components/form'
import { Spinner } from '~/components/svgs'
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
import {
  Bleed,
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
                  // { label: 'NFTs', value: 'nfts' },
                ]}
                onSelect={(item) => {
                  setParams({ tab: item.value })
                }}
              />
              <TabsContent inset={false} value="tokens">
                <Tokens accountAddress={address as Address} />
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

function Tokens({ accountAddress }: { accountAddress: Address }) {
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

function ImportToken({ accountAddress }: { accountAddress: Address }) {
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

interface TokenRowProps {
  accountAddress: Address
  tokenAddress?: Address
}

function TokenRow({ accountAddress, tokenAddress }: TokenRowProps) {
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
