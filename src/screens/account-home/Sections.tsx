import { ArrowDownLeft, ArrowUpRight, Code2, FilePlus2, Link2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Abi, Address, Transaction } from 'viem'

import { connect, disconnect } from '~/actions'
import { Box, Button, Text } from '~/design-system'
import { useAccountActivity } from '~/hooks/useAccountActivity'
import { useAccountTokens } from '~/hooks/useAccountTokens'
import { useAccounts } from '~/hooks/useAccounts'
import { useContracts } from '~/hooks/useContracts'
import { useEmptyTokens } from '~/hooks/useEmptyTokens'
import { useFunctionName } from '~/hooks/useFunctionName'
import { useHost } from '~/hooks/useHost'
import { getMessenger } from '~/messengers'
import { truncate } from '~/utils'
import { useSessionsStore } from '~/zustand'

import { EmptyTokensToggle } from '../account-details/EmptyTokensToggle'
import { ImportToken } from '../account-details/ImportToken'
import { TokenRow } from '../account-details/TokenRow'
import { formatEth } from './AccountPlate'
import * as styles from './account-home.css'

const inpageMessenger = getMessenger('wallet:inpage')
const blockIntl = new Intl.NumberFormat('en-US')

function Section({
  title,
  aside,
  children,
}: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.section} aria-label={title}>
      <header className={styles.sectionHeader}>
        <Box className={styles.shrink}>
          <Text as="h2" size="13px" weight="medium" wrap={false}>
            {title}
          </Text>
        </Box>
        {aside}
      </header>
      {children}
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <Box className={styles.empty}>
      <Text color="text/secondary" size="12px">
        {children}
      </Text>
    </Box>
  )
}

////////////////////////////////////////////////////////////////////////
// Tokens

const TOKEN_PREVIEW_COUNT = 5

export function TokensSection({ address }: { address: Address }) {
  const { tokens } = useAccountTokens({ address })
  const [importing, setImporting] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showEmpty, setShowEmpty] = useState(false)
  const visible = tokens?.filter((token) => token.visible) ?? []
  // Discovered tokens with a zero balance collapse; the preview counts the rest.
  const { populated, empty } = useEmptyTokens({ address, tokens: visible })
  const shown = expanded ? populated : populated.slice(0, TOKEN_PREVIEW_COUNT)
  const canExpand = populated.length > TOKEN_PREVIEW_COUNT

  return (
    <Section
      title="Tokens"
      aside={
        <button
          type="button"
          className={styles.textButton}
          onClick={() => setImporting((x) => !x)}
        >
          <Text size="12px" wrap={false}>
            {importing ? 'Close' : 'Import token'}
          </Text>
        </button>
      }
    >
      {importing && (
        <Box className={styles.sectionBody}>
          <ImportToken accountAddress={address} />
        </Box>
      )}
      {visible.length === 0 ? (
        <Empty>
          No ERC-20s yet. They show up here once this account receives a
          transfer.
        </Empty>
      ) : populated.length === 0 ? (
        <Empty>No tokens with a balance.</Empty>
      ) : (
        shown.map((token) => (
          <TokenRow
            key={token.address}
            accountAddress={address}
            tokenAddress={token.address}
          />
        ))
      )}
      {(canExpand || empty.length > 0) && (
        <Box className={styles.more}>
          {canExpand && (
            <button
              type="button"
              className={styles.textButton}
              onClick={() => setExpanded((x) => !x)}
            >
              <Text size="12px" wrap={false}>
                {expanded ? 'Show fewer' : `Show all ${populated.length}`}
              </Text>
            </button>
          )}
          {empty.length > 0 && (
            <EmptyTokensToggle
              count={empty.length}
              open={showEmpty}
              onToggle={() => setShowEmpty((x) => !x)}
            />
          )}
        </Box>
      )}
      {showEmpty &&
        empty.map((token) => (
          <TokenRow
            key={token.address}
            accountAddress={address}
            tokenAddress={token.address}
          />
        ))}
    </Section>
  )
}

////////////////////////////////////////////////////////////////////////
// Connected dApps

export function ConnectedSection() {
  const { data: host } = useHost()
  const { sessions } = useSessionsStore()
  const hostConnected = Boolean(
    host && sessions.some((session) => session.host === host),
  )

  return (
    <Section
      title="Connected"
      aside={
        <Text color="text/tertiary" size="12px" wrap={false}>
          {sessions.length === 1 ? '1 dApp' : `${sessions.length} dApps`}
        </Text>
      }
    >
      {host && !hostConnected && (
        <Box className={styles.row}>
          <Link2 className={styles.rowIcon} size={14} strokeWidth={1.75} />
          <Box className={styles.rowMain}>
            <Text size="13px" weight="medium" wrap={false}>
              {host}
            </Text>
            <Box paddingTop="6px">
              <Text color="text/tertiary" size="12px" wrap={false}>
                This tab · not connected
              </Text>
            </Box>
          </Box>
          <Button
            height="24px"
            variant="stroked fill"
            width="fit"
            onClick={() => connect({ host, messenger: inpageMessenger })}
          >
            Connect
          </Button>
        </Box>
      )}
      {sessions.map((session) => (
        <Box key={session.host} className={styles.row}>
          <Link2 className={styles.rowIcon} size={14} strokeWidth={1.75} />
          <Box className={styles.rowMain}>
            <Box style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Box className={styles.shrink}>
                <Text size="13px" weight="medium" wrap={false}>
                  {session.host.replace('www.', '')}
                </Text>
              </Box>
              {session.host === host && (
                <Box className={styles.pill}>
                  <Text size="11px" weight="medium" wrap={false}>
                    This tab
                  </Text>
                </Box>
              )}
            </Box>
          </Box>
          <Button
            height="24px"
            variant="stroked fill"
            width="fit"
            onClick={() =>
              disconnect({ host: session.host, messenger: inpageMessenger })
            }
          >
            Disconnect
          </Button>
        </Box>
      ))}
      {!host && sessions.length === 0 && (
        <Empty>No dApps connected. Open one and connect it to DevWallet.</Empty>
      )}
    </Section>
  )
}

////////////////////////////////////////////////////////////////////////
// Recent activity

const RECENT_COUNT = 5

export function RecentActivitySection({ address }: { address: Address }) {
  const { isFetched, sponsoredHashes, transactions } =
    useAccountActivity(address)
  const { contracts } = useContracts({ enabled: false })
  const accounts = useAccounts()

  const nameOf = (target?: Address | null) => {
    if (!target) return undefined
    const lower = target.toLowerCase()
    return (
      contracts.find((c) => c.address.toLowerCase() === lower)?.name ||
      accounts.find((a) => a.address.toLowerCase() === lower)?.displayName
    )
  }
  const abiOf = (target?: Address | null) => {
    if (!target) return undefined
    const lower = target.toLowerCase()
    return contracts.find((c) => c.address.toLowerCase() === lower)?.abi
  }

  const recent = transactions.slice(0, RECENT_COUNT)

  return (
    <Section
      title="Recent activity"
      aside={
        <Link
          to={`/account/${address}?tab=activity`}
          className={styles.textButton}
        >
          <Text size="12px" wrap={false}>
            All activity
          </Text>
        </Link>
      }
    >
      {recent.length === 0 ? (
        <Empty>
          {isFetched
            ? 'Nothing among the latest transactions on this node. All activity searches older blocks.'
            : 'Loading…'}
        </Empty>
      ) : (
        recent.map(({ transaction, status }) => (
          <ActivityRow
            key={transaction.hash}
            abiOf={abiOf}
            address={address}
            nameOf={nameOf}
            pending={status === 'pending'}
            sponsored={sponsoredHashes.has(transaction.hash)}
            transaction={transaction}
          />
        ))
      )}
    </Section>
  )
}

function ActivityRow({
  abiOf,
  address,
  nameOf,
  pending,
  sponsored,
  transaction,
}: {
  abiOf: (target?: Address | null) => Abi | undefined
  address: Address
  nameOf: (target?: Address | null) => string | undefined
  pending: boolean
  sponsored: boolean
  transaction: Transaction
}) {
  const lower = address.toLowerCase()
  const outgoing = sponsored || transaction.from.toLowerCase() === lower
  const isDeploy = !transaction.to
  const isCall = transaction.input && transaction.input !== '0x'
  const functionName = useFunctionName({
    abi: abiOf(transaction.to),
    data: isCall && outgoing && !isDeploy ? transaction.input : undefined,
  })

  const counterparty = outgoing ? transaction.to : transaction.from
  const counterpartyLabel =
    nameOf(counterparty) ||
    (counterparty ? truncate(counterparty, { start: 6, end: 4 }) : '')

  const [Icon, title, detail] = isDeploy
    ? [FilePlus2, 'Deployed contract', transaction.hash]
    : !outgoing
      ? [ArrowDownLeft, 'Received', `from ${counterpartyLabel}`]
      : isCall
        ? [
            Code2,
            `${functionName ?? 'Call'} ${nameOf(transaction.to) ?? ''}`.trim(),
            `to ${truncate(transaction.to!, { start: 6, end: 4 })}`,
          ]
        : [ArrowUpRight, 'Sent', `to ${counterpartyLabel}`]

  return (
    <Link to={`/transaction/${transaction.hash}`} className={styles.rowLink}>
      <Icon className={styles.rowIcon} size={14} strokeWidth={1.75} />
      <Box className={styles.rowMain}>
        <Box style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Box className={styles.shrink}>
            <Text size="13px" weight="medium" wrap={false}>
              {title}
            </Text>
          </Box>
          {sponsored && (
            <Box
              className={styles.pillGreen}
              title={`Gas paid by ${transaction.from}`}
            >
              <Text size="11px" weight="medium" wrap={false}>
                Sponsored
              </Text>
            </Box>
          )}
        </Box>
        <Box paddingTop="6px">
          <Text color="text/tertiary" family="mono" size="12px" wrap={false}>
            {isDeploy ? truncate(detail, { start: 10, end: 6 }) : detail}
          </Text>
        </Box>
      </Box>
      <Box className={styles.rowEnd}>
        <Text align="right" family="mono" size="13px" tabular wrap={false}>
          {transaction.value
            ? `${formatEth(transaction.value)} ETH`
            : '0'}
        </Text>
        <Box paddingTop="6px">
          <Text
            align="right"
            color="text/tertiary"
            family="mono"
            size="12px"
            wrap={false}
          >
            {pending || transaction.blockNumber === null
              ? 'Pending'
              : `#${blockIntl.format(transaction.blockNumber)}`}
          </Text>
        </Box>
      </Box>
    </Link>
  )
}
