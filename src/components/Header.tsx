import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router-dom'
import { type Hex, formatGwei } from 'viem'

import { History, Pickaxe } from 'lucide-react'

import { Tooltip } from '~/components'
import { DWLogo } from '~/components/svgs/DWLogo'
import { useAppMeta } from '~/contexts'
import {
  Box,
  Button,
  Column,
  Columns,
  Inline,
  Inset,
  Row,
  Rows,
  SFSymbol,
  Separator,
  Stack,
  Text,
} from '~/design-system'
import { useGetAutomine } from '~/hooks/useGetAutomine'
import { useHost } from '~/hooks/useHost'
import { useMine } from '~/hooks/useMine'
import { useNetworkStatus } from '~/hooks/useNetworkStatus'
import { usePendingBlock } from '~/hooks/usePendingBlock'
import { truncate } from '~/utils'
import { useAccountStore, useNetworkStore, useSessionsStore } from '~/zustand'

import { useRevert } from '../hooks/useRevert'
import { useSnapshot } from '../hooks/useSnapshot'

export function Header({ isNetworkOffline }: { isNetworkOffline?: boolean }) {
  const { type } = useAppMeta()
  return (
    <Rows>
      <Row>
        <Columns width="full">
          <Column width="content">
            <HomeButton />
          </Column>
          <Column width="content">
            <Separator orientation="vertical" />
          </Column>
          <Column style={{ maxWidth: '340px' }}>
            <Account />
          </Column>
          {type === 'embedded' && (
            <>
              <Column width="content">
                <Separator orientation="vertical" />
              </Column>
              <Column>
                <DappConnection />
              </Column>
              <Column width="content">
                <Separator orientation="vertical" />
              </Column>
              <Column width="content">
                <SettingsButton />
              </Column>
            </>
          )}
        </Columns>
      </Row>
      <Row height="content">
        <Separator />
      </Row>
      <Row>
        <Network />
      </Row>
      <Row height="content">
        <Separator />
      </Row>
      <Row>
        <Box
          width="full"
          style={
            isNetworkOffline ? { opacity: 0.5, pointerEvents: 'none' } : {}
          }
        >
          <Block />
        </Box>
      </Row>
      <Row height="content">
        <Separator />
      </Row>
    </Rows>
  )
}

function HeaderItem({
  children,
  label,
}: { children: ReactNode; label: string }) {
  return (
    <Stack gap="8px">
      <Text color="text/tertiary" size="9px" wrap={false}>
        {label.toUpperCase()}
      </Text>
      <Box paddingTop="2px">{children}</Box>
    </Stack>
  )
}

////////////////////////////////////////////////////////////////////////
// Top Bar

function HomeButton() {
  return (
    <Link to="/" style={{ height: '100%' }}>
      <Box
        alignItems="center"
        backgroundColor={{
          hover: 'surface/fill/quarternary',
        }}
        display="flex"
        justifyContent="center"
        height="full"
        style={{ width: '36px' }}
      >
        <DWLogo size="22px" />
      </Box>
    </Link>
  )
}

function Account() {
  const { account } = useAccountStore()

  // Hack to bypass truncated text mounting issues.
  const [key, setKey] = useState(0)
  useLayoutEffect(() => {
    requestAnimationFrame(() => setKey((key) => key + 1))
  }, [account?.address])

  // Flash animation when account changes
  const [isFlashing, setIsFlashing] = useState(false)
  const [transitionDuration, setTransitionDuration] = useState('200ms')
  const prevAccountRef = useRef<string | undefined>(account?.address)

  useEffect(() => {
    if (
      account?.address &&
      account.address !== prevAccountRef.current &&
      prevAccountRef.current !== undefined
    ) {
      // Fast switch to flash color (50ms)
      setTransitionDuration('50ms')
      setIsFlashing(true)

      // Then slowly fade back (200ms)
      const fadeTimer = setTimeout(() => {
        setTransitionDuration('200ms')
        setIsFlashing(false)
      }, 50)

      return () => clearTimeout(fadeTimer)
    }
    prevAccountRef.current = account?.address
  }, [account?.address])

  if (!account) return null
  return (
    <Link to="/" style={{ height: '100%' }}>
      <Box
        alignItems="center"
        backgroundColor={{
          hover: 'surface/fill/quarternary',
        }}
        display="flex"
        height="full"
        style={{
          cursor: 'default',
          transition: `background-color ${transitionDuration} ease-out`,
          ...(isFlashing && {
            backgroundColor: 'var(--flash-color)',
          }),
        }}
      >
        <Inset horizontal="8px">
          {account && (
            <HeaderItem label="Account">
              <Box title={account.address}>
                {account.displayName ? (
                  <Inline
                    key={key}
                    gap="4px"
                    alignVertical="center"
                    wrap={false}
                  >
                    <Text size="11px" wrap={false}>
                      {account.displayName.length > 20
                        ? `${account.displayName.slice(0, 20)}…`
                        : account.displayName}
                    </Text>
                    <Text
                      color="text/tertiary"
                      family="address"
                      size="9px"
                      wrap={false}
                    >
                      {truncate(account.address, { start: 5, end: 3 })}
                    </Text>
                  </Inline>
                ) : (
                  <Text.Truncated key={key} size="11px">
                    {account.address}
                  </Text.Truncated>
                )}
              </Box>
            </HeaderItem>
          )}
        </Inset>
      </Box>
    </Link>
  )
}

function DappConnection() {
  const { data: host } = useHost()
  const { sessions } = useSessionsStore()
  const isConnected = Boolean(
    host && sessions.find((session) => session.host === host),
  )

  return (
    <Link to="session" style={{ height: '100%' }}>
      <Box
        alignItems="center"
        backgroundColor={{
          hover: 'surface/fill/quarternary',
        }}
        display="flex"
        height="full"
        style={{ cursor: 'default' }}
      >
        <Inset horizontal="8px">
          <HeaderItem label={host?.replace('www.', '') || ''}>
            <Inline alignVertical="center" gap="4px" wrap={false}>
              <Text size="12px" style={{ opacity: isConnected ? 1 : 0.5 }}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </Text>
            </Inline>
          </HeaderItem>
        </Inset>
      </Box>
    </Link>
  )
}

function SettingsButton() {
  return (
    <Link
      to="/settings"
      style={{ height: '100%', display: 'flex', alignItems: 'center' }}
    >
      <Box
        alignItems="center"
        as="button"
        backgroundColor={{
          hover: 'surface/fill/quarternary',
        }}
        display="flex"
        justifyContent="center"
        title="Settings"
        style={{ width: '32px', height: '32px' }}
      >
        <SFSymbol size="14px" symbol="gear" weight="medium" />
      </Box>
    </Link>
  )
}

////////////////////////////////////////////////////////////////////////
// Middle Bar

function Network() {
  return (
    <Link to="networks" style={{ height: '100%', width: '100%' }}>
      <Box
        alignItems="center"
        backgroundColor={{
          hover: 'surface/fill/quarternary',
        }}
        display="flex"
        height="full"
        maxWidth="480px"
        style={{ cursor: 'default' }}
      >
        <Inset horizontal="8px">
          <Columns alignVertical="center" gap="12px">
            <Column alignVertical="center">
              <RpcUrl />
            </Column>
            <Column alignVertical="center">
              <Inset left="8px">
                <Chain />
              </Inset>
            </Column>
          </Columns>
        </Inset>
      </Box>
    </Link>
  )
}

function RpcUrl() {
  const { network } = useNetworkStore()
  const { data: listening, status } = useNetworkStatus()

  return (
    <HeaderItem label="RPC URL">
      <Inline alignVertical="center" gap="4px" wrap={false}>
        <Box
          backgroundColor={
            status === 'pending'
              ? 'surface/invert@0.5'
              : listening
                ? 'surface/green'
                : 'surface/red'
          }
          borderWidth="1px"
          borderRadius="round"
          style={{ minWidth: 8, minHeight: 8, maxHeight: 8, maxWidth: 8 }}
        />
        <Text
          size="12px"
          wrap={false}
          width="full"
          style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {network.rpcUrl.replace(/https?:\/\//, '')}
        </Text>
      </Inline>
    </HeaderItem>
  )
}

function Chain() {
  const { network } = useNetworkStore()

  return (
    <HeaderItem label="Chain">
      <Text size="12px" wrap={false} width="full">
        <Text as="span" family="numeric">
          {network.chainId}
        </Text>
        : {network.name}
      </Text>
    </HeaderItem>
  )
}

////////////////////////////////////////////////////////////////////////
// Lower Bar

function Block() {
  return (
    <Link to="block-config" style={{ width: '100%' }}>
      <Box
        alignItems="center"
        backgroundColor={{
          hover: 'surface/fill/quarternary',
        }}
        display="flex"
        height="full"
        maxWidth="480px"
        width="full"
        style={{ cursor: 'default' }}
      >
        <Columns width="full">
          <Column alignVertical="center">
            <Inset horizontal="8px">
              <BlockNumber />
            </Inset>
          </Column>
          <Column alignVertical="center">
            <Inset horizontal="8px">
              <MiningStatus />
            </Inset>
          </Column>
          <Column alignVertical="center">
            <Inset horizontal="8px">
              <BaseFee />
            </Inset>
          </Column>
        </Columns>
      </Box>
    </Link>
  )
}

function BlockNumber() {
  const { data: block } = usePendingBlock()
  const { data: snapshot } = useSnapshot({
    blockNumber: block?.number ? block?.number - 1n : undefined,
    enabled: false,
  })
  return (
    <Box position="relative">
      <Inline alignVertical="center" gap="4px" wrap={false}>
        <Box width="fit">
          <HeaderItem label="Block">
            <Text family="numeric" size="12px" tabular>
              {block?.number ? block?.number.toString() : ''}
            </Text>
          </HeaderItem>
        </Box>
        <Inline gap="8px" wrap={false}>
          {block && <MineButton />}
          <RevertButton snapshot={snapshot} />
        </Inline>
      </Inline>
    </Box>
  )
}

function MiningStatus() {
  const { data: block } = usePendingBlock()
  const { data: automining } = useGetAutomine()
  const { network } = useNetworkStore()
  return (
    <HeaderItem label="Mining Status">
      <Text size="12px">
        {block
          ? automining
            ? 'Automine'
            : network.blockTime
              ? `Interval: ${network.blockTime}s`
              : 'On Demand'
          : ''}
      </Text>
    </HeaderItem>
  )
}

function BaseFee() {
  const { data: block } = usePendingBlock()
  const intl = useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
        maximumSignificantDigits: 6,
      }),
    [],
  )
  if (!block) return null
  return (
    <HeaderItem label="Base Fee (gwei)">
      <Text family="numeric" size="12px">
        {intl.format(Number(formatGwei(block.baseFeePerGas!)))}
      </Text>
    </HeaderItem>
  )
}

function MineButton() {
  const { data: block } = usePendingBlock()
  const { mutateAsync: mine } = useMine()

  return (
    <Box
      key={block?.number?.toString()}
      style={{ marginTop: '14px', cursor: 'pointer' }}
    >
      <Tooltip label="Mine Block">
        <Button.Root
          aria-label="Mine Block"
          height="20px"
          onClick={(e) => {
            e.preventDefault()
            mine({ blocks: 1 })
          }}
          variant="ghost primary"
          width="fit"
        >
          <Pickaxe size={18} />
        </Button.Root>
      </Tooltip>
    </Box>
  )
}

function RevertButton({ snapshot }: { snapshot?: Hex }) {
  const { mutateAsync: revert } = useRevert()

  return (
    <Box
      key={snapshot}
      style={{
        marginTop: '14px',
        cursor: snapshot ? 'pointer' : 'not-allowed',
      }}
    >
      <Tooltip label="Revert Block">
        <Button.Root
          aria-label="Revert Block"
          disabled={!snapshot}
          height="20px"
          onClick={(e) => {
            e.preventDefault()
            revert({ id: snapshot! })
          }}
          variant="ghost primary"
          width="fit"
        >
          <History size={18} />
        </Button.Root>
      </Tooltip>
    </Box>
  )
}
