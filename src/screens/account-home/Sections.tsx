import {
  ArrowDownLeft,
  ArrowUpRight,
  Code2,
  FilePlus2,
  Layers,
  Link2,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Abi, Address } from 'viem'

import { connect, disconnect } from '~/actions'
import { ActivityTags } from '~/components/ActivityTags'
import { Box, Button, Text } from '~/design-system'
import { useAccountActivity } from '~/hooks/useAccountActivity'
import { useAccountTokens } from '~/hooks/useAccountTokens'
import { useAccounts } from '~/hooks/useAccounts'
import { useContracts } from '~/hooks/useContracts'
import { useEmptyTokens } from '~/hooks/useEmptyTokens'
import { useFunctionName } from '~/hooks/useFunctionName'
import { useHost } from '~/hooks/useHost'
import { truncate } from '~/utils'
import {
  type ActivityItem,
  activitySubject,
  knownName,
} from '~/utils/activity'
import { useSessionsStore } from '~/zustand'

import { EmptyTokensToggle } from '../account-details/EmptyTokensToggle'
import { ImportToken } from '../account-details/ImportToken'
import { TokenRow } from '../account-details/TokenRow'
import { formatEth } from './AccountPlate'
import * as styles from './account-home.css'

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
            onClick={() => connect({ host })}
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
                  {session.host}
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
            onClick={() => disconnect({ host: session.host })}
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
      accounts.find((a) => a.address.toLowerCase() === lower)?.displayName ||
      knownName(target)
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
        recent.map((item) => (
          <ActivityRow
            key={item.transaction.hash}
            abiOf={abiOf}
            address={address}
            item={item}
            nameOf={nameOf}
            sponsored={sponsoredHashes.has(item.transaction.hash)}
          />
        ))
      )}
    </Section>
  )
}

function ActivityRow({
  abiOf,
  address,
  item,
  nameOf,
  sponsored,
}: {
  abiOf: (target?: Address | null) => Abi | undefined
  address: Address
  item: ActivityItem
  nameOf: (target?: Address | null) => string | undefined
  sponsored: boolean
}) {
  const { transaction, status, userOps } = item
  // A user operation reads as the account's calls, not as handleOps.
  const subject = activitySubject(item)
  const lower = address.toLowerCase()
  const outgoing = sponsored || transaction.from.toLowerCase() === lower
  const isDeploy = !subject.to
  const isBatch = subject.count > 1
  const isCall = subject.input && subject.input !== '0x'
  const functionName = useFunctionName({
    abi: abiOf(subject.to),
    data:
      isCall && outgoing && !isDeploy && !isBatch ? subject.input : undefined,
  })

  const counterparty = outgoing ? subject.to : transaction.from
  const counterpartyLabel =
    nameOf(counterparty) ||
    (counterparty ? truncate(counterparty, { start: 6, end: 4 }) : '')

  const [Icon, title, detail] = isDeploy
    ? [FilePlus2, 'Deployed contract', transaction.hash]
    : !outgoing
      ? [ArrowDownLeft, 'Received', `from ${counterpartyLabel}`]
      : isBatch
        ? [
            Layers,
            `Batch of ${subject.count} calls`,
            `to ${counterpartyLabel} +${subject.count - 1}`,
          ]
        : isCall
          ? [
              Code2,
              `${functionName ?? 'Call'} ${nameOf(subject.to) ?? ''}`.trim(),
              `to ${truncate(subject.to!, { start: 6, end: 4 })}`,
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
          <ActivityTags
            payer={
              sponsored
                ? nameOf(transaction.from) || transaction.from
                : undefined
            }
            reverted={userOps?.success === false}
          />
        </Box>
        <Box paddingTop="6px">
          <Text color="text/tertiary" family="mono" size="12px" wrap={false}>
            {isDeploy ? truncate(detail, { start: 10, end: 6 }) : detail}
          </Text>
        </Box>
      </Box>
      <Box className={styles.rowEnd}>
        <Text align="right" family="mono" size="13px" tabular wrap={false}>
          {subject.value ? `${formatEth(subject.value)} ETH` : '0'}
        </Text>
        <Box paddingTop="6px">
          <Text
            align="right"
            color="text/tertiary"
            family="mono"
            size="12px"
            wrap={false}
          >
            {status === 'pending' || transaction.blockNumber === null
              ? 'Pending'
              : `#${blockIntl.format(transaction.blockNumber)}`}
          </Text>
        </Box>
      </Box>
    </Link>
  )
}
