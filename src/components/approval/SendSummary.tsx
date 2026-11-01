import type { UseQueryResult } from '@tanstack/react-query'
import { CircleCheck, CircleDashed, TriangleAlert } from 'lucide-react'
import type { Address } from 'viem'

import { Box, Button, Text } from '~/design-system'
import type { SendPreview } from '~/smart/preview'
import { truncate } from '~/utils'
import {
  type SendMethod,
  estimatedCost,
  ethAmount,
  gasShortfall,
  modeName,
  pathLabel,
  signAnyway,
  upgradesFirst,
} from '~/utils/sendPreview'
import type { RpcTransaction } from '~/utils/transactionForm'

import { BalanceChanges } from './BalanceChanges'
import * as styles from './approval.css'
import { AddressLine, Notice, Readout } from './parts'

const gasIntl = new Intl.NumberFormat('en-US')

/**
 * What a send would do, from its preview: who sends, the account's mode, who
 * pays, how it goes out and what it costs, then the simulation's verdict and
 * the balance changes it predicts. A preview of other calls, kept while the
 * current ones are simulated, or one that failed to refresh, is dimmed.
 * `tx` is an `eth_sendTransaction`'s, whose gas and fees count when the node
 * gets it as it is.
 */
export function SendSummary({
  from,
  method,
  preview,
  tx,
}: {
  from: Address
  method: SendMethod
  preview: UseQueryResult<SendPreview>
  tx?: RpcTransaction
}) {
  const { data, error, isPlaceholderData } = preview
  const simulation = data?.simulation
  const stale = isPlaceholderData || Boolean(error)
  const shortfall = data && !stale ? gasShortfall(method, data, tx) : null

  return (
    <>
      <section aria-label="Summary" className={styles.block}>
        <AddressLine label="From" address={from} />
        <Box className={stale ? styles.stale : undefined} aria-busy={stale}>
          {data && <Readouts method={method} preview={data} tx={tx} />}
          {upgradesFirst(method, data) && (
            <Notice tone="blue" title="Upgrades first">
              <Text size="12px">
                This account will be upgraded to a Kernel v3.3 smart account
                (same address) before sending.
              </Text>
            </Notice>
          )}
        </Box>
        <Verdict method={method} preview={preview} />
        {shortfall && (
          <Notice tone="yellow" title="Runs out of gas">
            <Text size="12px">
              {`The gas limit, ${gasIntl.format(shortfall.limit)}, is under the ${gasIntl.format(shortfall.used)} gas the simulation used, and the node sends it as it is.`}
            </Text>
          </Notice>
        )}
        {data?.fallbackReason && (
          <Box className={stale ? styles.stale : undefined}>
            <Notice tone="yellow" title="Not sponsored">
              <Text size="12px">{data.fallbackReason}</Text>
            </Notice>
          </Box>
        )}
      </section>
      {simulation?.ok && simulation.balanceChanges && (
        <Box className={stale ? styles.stale : undefined} aria-busy={stale}>
          <BalanceChanges changes={simulation.balanceChanges} />
        </Box>
      )}
    </>
  )
}

function Readouts({
  method,
  preview,
  tx,
}: {
  method: SendMethod
  preview: SendPreview
  tx?: RpcTransaction
}) {
  const { path, payer, sponsored } = preview
  const wei = estimatedCost(method, preview, tx)
  const cost = wei === null ? null : ethAmount(wei)
  const route = path && pathLabel(path)

  return (
    <Box className={styles.readouts}>
      <Readout label="Mode">
        <Word>{modeName(preview.mode)}</Word>
      </Readout>
      <Readout label="Paid by" title={payer ?? undefined}>
        {path === null ? (
          <Word muted>—</Word>
        ) : sponsored && payer ? (
          <>
            <Word>Sponsor</Word>
            <Box className={styles.shrink}>
              <Text color="text/secondary" family="mono" size="12px" wrap={false}>
                {truncate(payer, { start: 6, end: 4 })}
              </Text>
            </Box>
          </>
        ) : (
          <Word>Account</Word>
        )}
      </Readout>
      <Readout label="Path" title={route?.description}>
        {route ? <Word>{route.label}</Word> : <Word muted>—</Word>}
      </Readout>
      <Readout label="Est. cost">
        {cost ? (
          <>
            <Box className={styles.shrink}>
              <Text family="mono" size="14px" tabular wrap={false}>
                {cost.amount}
              </Text>
            </Box>
            <Box className={styles.fit}>
              <Text color="text/tertiary" size="11px" wrap={false}>
                {cost.unit}
              </Text>
            </Box>
          </>
        ) : (
          <Word muted>Unknown</Word>
        )}
      </Readout>
    </Box>
  )
}

/** A readout's value in words: Inter 14px, sized to fit its cell. */
function Word({
  muted = false,
  children,
}: { muted?: boolean; children: string }) {
  return (
    <Box className={styles.shrink}>
      <Text
        color={muted ? 'text/tertiary' : undefined}
        size="14px"
        wrap={false}
      >
        {children}
      </Text>
    </Box>
  )
}

/**
 * The simulation's verdict, or why there is none. After a failed refresh, the
 * last verdict stays, marked out of date.
 */
function Verdict({
  method,
  preview,
}: {
  method: SendMethod
  preview: UseQueryResult<SendPreview>
}) {
  const { data, error, isPlaceholderData } = preview

  if (error && !data)
    return (
      <Notice tone="red" title="No preview">
        <Text size="12px">{error.message}</Text>
      </Notice>
    )
  if (!data && !preview.isLoading)
    return <Status icon="neutral">Nothing to simulate.</Status>
  if (!data || isPlaceholderData)
    return (
      <Status icon="neutral">
        {data ? 'Simulating the changed calls…' : 'Simulating…'}
      </Status>
    )
  if (error)
    return (
      <>
        <Box className={styles.stale}>
          <Judgement method={method} preview={data} />
        </Box>
        <div role="status" className={styles.status}>
          <TriangleAlert
            className={styles.statusIcon.warn}
            size={14}
            strokeWidth={1.75}
          />
          <Box className={styles.grow}>
            <Text color="text/secondary" size="12px">
              {`Out of date: refreshing the preview failed (${error.message}). It tries again with the next block.`}
            </Text>
          </Box>
          <Button
            disabled={preview.isFetching}
            height="20px"
            variant="stroked fill"
            width="fit"
            onClick={() => void preview.refetch()}
          >
            Retry
          </Button>
        </div>
      </>
    )
  return <Judgement method={method} preview={data} />
}

/** What the simulation of the calls says. */
function Judgement({
  method,
  preview: data,
}: {
  method: SendMethod
  preview: SendPreview
}) {
  if (data.error)
    return (
      <Notice tone="red" title="Can't be sent">
        <Text size="12px">{data.error.message}</Text>
      </Notice>
    )

  const { simulation } = data
  if (!simulation.ok)
    return (
      <Notice
        tone="red"
        title={
          simulation.failedIndex === null
            ? 'Expected to revert'
            : `Call ${simulation.failedIndex + 1} is expected to revert`
        }
      >
        <Text size="12px">{simulation.message}</Text>
        {simulation.revertData && (
          <Box paddingTop="6px">
            <Text family="mono" size="12px" wrap="anywhere">
              {simulation.revertData}
            </Text>
          </Box>
        )}
        <Box paddingTop="6px">
          <Text size="12px">
            {signAnyway(method, data)
              ? 'Sign anyway sends it, and it reverts on chain.'
              : 'Approving hands it to the node as it is.'}
          </Text>
        </Box>
      </Notice>
    )
  if (simulation.gasUsed === null)
    return (
      <Status icon="neutral">
        No revert found. This node doesn't report gas or balance changes.
      </Status>
    )
  return (
    <Status icon="ok">
      Simulation passes{' '}
      <Text color="text/tertiary" family="mono" size="12px" tabular>
        · {gasIntl.format(BigInt(simulation.gasUsed))} gas
      </Text>
    </Status>
  )
}

function Status({
  icon,
  children,
}: { icon: 'ok' | 'neutral'; children: React.ReactNode }) {
  const Icon = icon === 'ok' ? CircleCheck : CircleDashed
  return (
    <div role="status" className={styles.status}>
      <Icon className={styles.statusIcon[icon]} size={14} strokeWidth={1.75} />
      <Box className={styles.grow}>
        <Text color="text/secondary" size="12px">
          {children}
        </Text>
      </Box>
    </div>
  )
}
