import type { UseQueryResult } from '@tanstack/react-query'
import { CircleCheck, CircleDashed } from 'lucide-react'
import type { Address } from 'viem'

import { Box, Text } from '~/design-system'
import type { SendPreview } from '~/smart/preview'
import { truncate } from '~/utils'
import {
  type SendMethod,
  ethAmount,
  modeLabel,
  pathLabel,
  signAnyway,
  upgradesFirst,
} from '~/utils/sendPreview'

import { BalanceChanges } from './BalanceChanges'
import * as styles from './approval.css'
import { AddressLine, Notice, Readout } from './parts'

const gasIntl = new Intl.NumberFormat('en-US')

/**
 * What a send would do, from its preview: who sends, the account's mode, who
 * pays, how it goes out and what it costs, then the simulation's verdict and
 * the balance changes it predicts.
 */
export function SendSummary({
  from,
  method,
  preview,
}: {
  from: Address
  method: SendMethod
  preview: UseQueryResult<SendPreview>
}) {
  const { data } = preview
  const simulation = data?.simulation

  return (
    <>
      <section aria-label="Summary" className={styles.block}>
        <AddressLine label="From" address={from} />
        {data && <Readouts preview={data} />}
        {upgradesFirst(method, data) && (
          <Notice tone="blue" title="Upgrades first">
            <Text size="12px">
              This account will be upgraded to a Kernel v3.3 smart account
              (same address) before sending.
            </Text>
          </Notice>
        )}
        <Verdict method={method} preview={preview} />
        {data?.fallbackReason && (
          <Notice tone="yellow" title="Not sponsored">
            <Text size="12px">{data.fallbackReason}</Text>
          </Notice>
        )}
      </section>
      {simulation?.ok && simulation.balanceChanges && (
        <BalanceChanges changes={simulation.balanceChanges} />
      )}
    </>
  )
}

function Readouts({ preview }: { preview: SendPreview }) {
  const { path, payer, sponsored, estimatedCostWei } = preview
  const cost =
    estimatedCostWei === null ? null : ethAmount(BigInt(estimatedCostWei))
  const route = path && pathLabel(path)

  return (
    <Box className={styles.readouts}>
      <Readout label="Mode">
        <Word>{modeLabel(preview.mode)}</Word>
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

/** The simulation's verdict, or why there is none. */
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
