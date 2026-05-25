import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router-dom'
import { type Address, formatEther, parseEther } from 'viem'

import {
  Bleed,
  Box,
  Button,
  Inline,
  Input,
  SFSymbol,
  Stack,
  Text,
} from '~/design-system'
import { useBalance } from '~/hooks/useBalance'
import { useNonce } from '~/hooks/useNonce'
import { useSetAccount } from '~/hooks/useSetAccount'
import { useSetBalance } from '~/hooks/useSetBalance'
import { useSetNonce } from '~/hooks/useSetNonce'
import { truncate } from '~/utils'
import { useAccountStore } from '~/zustand'
import type { Account } from '~/zustand/account'

import { Spinner } from './svgs'

const ALIAS_MAX_LENGTH = 24

function formatBalanceDisplay(formatted: string, maxDecimals = 2): string {
  const [whole, decimal] = formatted.split('.')
  if (!decimal) return whole
  const trimmed = decimal.slice(0, maxDecimals).replace(/0+$/, '')
  return trimmed ? `${whole}.${trimmed}` : whole
}

function DrawerPull({
  symbol,
  onClick,
}: {
  symbol: 'arrow.right' | 'checkmark'
  onClick?: (e: MouseEvent) => void
}) {
  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="center"
      backgroundColor={{
        default: 'surface/fill/quarternary',
        hover: 'surface/fill/tertiary',
      }}
      onClick={onClick}
      style={{
        width: '44px',
        alignSelf: 'stretch',
        flexShrink: 0,
        cursor: 'pointer',
      }}
    >
      <SFSymbol symbol={symbol} size="22px" />
    </Box>
  )
}

function UnitLabel({ children }: { children: ReactNode }) {
  return (
    <Text color="text/tertiary" size="9px" wrap={false}>
      {children}
    </Text>
  )
}

export function AccountCard({ account }: { account: Account }) {
  const {
    account: activeAccount,
    removeAccount,
    upsertAccount,
  } = useAccountStore()
  const { mutateAsync: setAccount } = useSetAccount()

  const active = activeAccount?.address === account.address
  const isLoading = account.state === 'loading'

  const [isEditingAlias, setIsEditingAlias] = useState(false)
  const [aliasValue, setAliasValue] = useState(account.displayName ?? '')
  const aliasInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (isEditingAlias) aliasInputRef.current?.focus()
  }, [isEditingAlias])

  const [isEditingValues, setIsEditingValues] = useState(false)

  const saveAlias = () => {
    const trimmed = aliasValue.trim()
    upsertAccount({
      account: { ...account, displayName: trimmed || undefined },
    })
    setIsEditingAlias(false)
  }
  const cancelAlias = () => {
    setAliasValue(account.displayName ?? '')
    setIsEditingAlias(false)
  }

  const handleSelectRow = () => {
    if (active || isLoading || isEditingAlias || isEditingValues) return
    void setAccount({ account, setActive: true })
  }

  const truncatedAddress = account.address
    ? truncate(
        account.address,
        account.displayName ? { start: 5, end: 4 } : { start: 8, end: 6 },
      )
    : undefined

  return (
    <Box
      position="relative"
      backgroundColor={
        active
          ? 'surface/fill/tertiary'
          : { hover: 'surface/fill/quarternary' }
      }
      marginHorizontal="-8px"
    >
      {active && (
        <Box
          position="absolute"
          backgroundColor="surface/invert"
          style={{ left: 0, top: 0, bottom: 0, width: '2px', zIndex: 1 }}
        />
      )}

      <Inline gap="0px" wrap={false}>
        {/* CONTENT: identity, values, address */}
        <Box
          paddingHorizontal="12px"
          paddingVertical="12px"
          style={{
            flex: 1,
            minWidth: 0,
            cursor: active || isLoading ? 'default' : 'pointer',
          }}
          onClick={handleSelectRow}
        >
          <Stack gap="6px">
        {/* ROW 1: identity (alias OR address if none) */}
        {isLoading ? (
          <Inline alignVertical="center" gap="6px">
            <Spinner size="11px" />
            <Text color="text/tertiary" size="12px" wrap={false}>
              Importing {truncate(account.key, { start: 12, end: 8 })}
            </Text>
          </Inline>
        ) : isEditingAlias ? (
          <Box position="relative" style={{ maxWidth: '220px' }}>
            <Input
              ref={aliasInputRef}
              height="24px"
              placeholder="Address alias..."
              value={aliasValue}
              maxLength={ALIAS_MAX_LENGTH}
              onChange={(e) =>
                setAliasValue(e.target.value.slice(0, ALIAS_MAX_LENGTH))
              }
              onClick={(e) => e.stopPropagation()}
              onBlur={saveAlias}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveAlias()
                if (e.key === 'Escape') cancelAlias()
              }}
              style={{ paddingRight: '36px' }}
            />
            <Box
              position="absolute"
              style={{
                right: '6px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
              }}
            >
              <Text color="text/tertiary" size="9px" wrap={false} tabular>
                {aliasValue.length}/{ALIAS_MAX_LENGTH}
              </Text>
            </Box>
          </Box>
        ) : (
          <Inline
            alignVertical="center"
            gap="6px"
            alignHorizontal="left"
            wrap={false}
          >
            {account.displayName ? (
              <Text size="12px" wrap={false}>
                {account.displayName}
              </Text>
            ) : (
              <Box title={account.address}>
                <Text family="address" size="12px" wrap={false}>
                  {truncatedAddress}
                </Text>
              </Box>
            )}
            <Button.Symbol
              label={account.displayName ? 'Edit alias' : 'Add alias'}
              symbol="square.and.pencil"
              height="16px"
              variant="ghost primary"
              onClick={(e) => {
                e.stopPropagation()
                setAliasValue(account.displayName ?? '')
                setIsEditingAlias(true)
              }}
            />
            {!account.displayName && account.address && (
              <Box
                onClick={(e) => e.stopPropagation()}
                style={{ display: 'inline-flex' }}
              >
                <Button.Copy
                  height="16px"
                  text={account.address}
                  variant="ghost primary"
                />
              </Box>
            )}
            {account.impersonate && !isEditingValues && (
              <Button.Symbol
                label="Remove"
                symbol="trash"
                height="16px"
                variant="ghost red"
                onClick={(e) => {
                  e.stopPropagation()
                  removeAccount({ account })
                }}
              />
            )}
          </Inline>
        )}

        {/* ROW 2 (only when alias exists): address + copy */}
        {!isLoading && account.address && account.displayName && (
          <Inline
            alignVertical="center"
            gap="6px"
            alignHorizontal="left"
            wrap={false}
          >
            <Box title={account.address}>
              <Text
                color="text/tertiary"
                family="address"
                size="11px"
                wrap={false}
              >
                {truncatedAddress}
              </Text>
            </Box>
            <Box
              onClick={(e) => e.stopPropagation()}
              style={{ display: 'inline-flex' }}
            >
              <Button.Copy
                height="16px"
                text={account.address}
                variant="ghost primary"
              />
            </Box>
          </Inline>
        )}

        {/* ROW 3: balance + nonce + edit pencil */}
        {!isLoading && (
          <Inline
            alignVertical="center"
            gap="12px"
            alignHorizontal="left"
            wrap={false}
          >
            <Balance
              address={account.address}
              isEditing={isEditingValues}
              onDone={() => setIsEditingValues(false)}
            />
            <Nonce
              address={account.address}
              isEditing={isEditingValues}
              onDone={() => setIsEditingValues(false)}
            />
            {!isEditingValues && (
              <Button.Symbol
                label="Edit balance and nonce"
                symbol="square.and.pencil"
                height="16px"
                variant="ghost primary"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsEditingValues(true)
                }}
              />
            )}
          </Inline>
        )}
          </Stack>
        </Box>

        {/* DRAWER PULL: open details or done-edit */}
        {!isLoading && account.address && (
          isEditingValues ? (
            <DrawerPull
              symbol="checkmark"
              onClick={(e) => {
                e.stopPropagation()
                setIsEditingValues(false)
              }}
            />
          ) : (
            <Link
              to={`account/${account.address}`}
              onClick={(e) => e.stopPropagation()}
              style={{ textDecoration: 'none', display: 'flex' }}
            >
              <DrawerPull symbol="arrow.right" />
            </Link>
          )
        )}
      </Inline>
    </Box>
  )
}

function Balance({
  address,
  isEditing,
  onDone,
}: {
  address?: Address
  isEditing?: boolean
  onDone?: () => void
}) {
  const { data: balance, isSuccess } = useBalance({ address })
  const { mutate } = useSetBalance()

  const [value, setValue] = useState(balance ? formatEther(balance) : '0')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (balance) setValue(formatEther(balance))
  }, [balance])
  useEffect(() => {
    if (isEditing) inputRef.current?.focus()
  }, [isEditing])

  const disabled = !isSuccess || !address
  const displayValue = disabled ? '—' : formatBalanceDisplay(value, 2)

  if (isEditing)
    return (
      <Box style={{ width: '90px' }}>
        <Bleed top="-2px">
          <Input
            ref={inputRef}
            disabled={disabled}
            onChange={(e) => setValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) =>
              address
                ? mutate({
                    address,
                    value: parseEther(e.target.value as `${number}`),
                  })
                : undefined
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                ;(e.target as HTMLInputElement).blur()
                onDone?.()
              }
            }}
            height="24px"
            value={disabled ? '' : value}
          />
        </Bleed>
      </Box>
    )

  return (
    <Box title={disabled ? undefined : `${value} ETH`}>
      <Inline gap="4px" alignVertical="center" wrap={false}>
        <Text family="numeric" size="12px" tabular wrap={false}>
          {displayValue}
        </Text>
        <UnitLabel>ETH</UnitLabel>
      </Inline>
    </Box>
  )
}

function Nonce({
  address,
  isEditing,
  onDone,
}: {
  address?: Address
  isEditing?: boolean
  onDone?: () => void
}) {
  const { data: nonce, isSuccess } = useNonce({ address })
  const { mutate } = useSetNonce()

  const [value, setValue] = useState(nonce?.toString() ?? '0')
  useEffect(() => {
    if (nonce !== undefined) setValue(nonce.toString())
  }, [nonce])

  const disabled = !isSuccess || !address

  if (isEditing)
    return (
      <Box style={{ width: '44px' }}>
        <Bleed top="-2px">
          <Input
            disabled={disabled}
            onChange={(e) => setValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            value={disabled ? '' : value}
            onBlur={(e) =>
              address
                ? mutate({ address, nonce: Number(e.target.value) })
                : undefined
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                ;(e.target as HTMLInputElement).blur()
                onDone?.()
              }
            }}
            height="24px"
          />
        </Bleed>
      </Box>
    )

  return (
    <Inline gap="4px" alignVertical="center" wrap={false}>
      <UnitLabel>NONCE</UnitLabel>
      <Text family="numeric" size="12px" tabular wrap={false}>
        {disabled ? '—' : value}
      </Text>
    </Inline>
  )
}
