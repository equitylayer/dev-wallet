import type { Address } from 'viem'

import { Box, Text } from '~/design-system'
import { useErc20Metadata } from '~/hooks/useErc20Metadata'
import type { BalanceChange } from '~/smart/simulate'
import { truncate } from '~/utils'
import { ethAmount, tokenAmount } from '~/utils/sendPreview'

import * as styles from './approval.css'
import { Empty, Section } from './parts'

/** A `BalanceChange` off the messenger: the delta in decimal. */
type Change = { token: BalanceChange['token']; delta: string }

/** The net change to the sending account, per token, as simulated. */
export function BalanceChanges({ changes }: { changes: readonly Change[] }) {
  return (
    <Section title="Balance changes">
      {changes.length === 0 ? (
        <Empty>No ETH or ERC-20 balance changes.</Empty>
      ) : (
        changes.map((change) =>
          change.token === 'native' ? (
            <NativeChange key="native" delta={BigInt(change.delta)} />
          ) : (
            <TokenChange
              key={change.token}
              token={change.token}
              delta={BigInt(change.delta)}
            />
          ),
        )
      )}
    </Section>
  )
}

function ChangeRow({
  name,
  detail,
  amount,
  unit,
}: { name: string; detail: string; amount: string; unit?: string }) {
  return (
    <Box className={styles.row}>
      <Box className={styles.grow}>
        <Text size="13px" weight="medium" wrap={false}>
          {name}
        </Text>
        <Box paddingTop="6px">
          <Text color="text/tertiary" family="mono" size="12px" wrap={false}>
            {detail}
          </Text>
        </Box>
      </Box>
      <Box className={styles.end}>
        <Text align="right" family="mono" size="13px" tabular wrap={false}>
          {amount}
          {unit && (
            <>
              {' '}
              <Text color="text/tertiary" size="11px">
                {unit}
              </Text>
            </>
          )}
        </Text>
      </Box>
    </Box>
  )
}

function NativeChange({ delta }: { delta: bigint }) {
  const { amount, unit } = ethAmount(delta, { signed: true })
  return <ChangeRow name="ETH" detail="Native" amount={amount} unit={unit} />
}

function TokenChange({ token, delta }: { token: Address; delta: bigint }) {
  const { data: metadata } = useErc20Metadata({ tokenAddress: token })
  const short = truncate(token, { start: 6, end: 4 })
  return (
    <ChangeRow
      name={metadata?.symbol || short}
      detail={metadata ? short : `${short} · raw units`}
      amount={tokenAmount(delta, metadata?.decimals ?? 0)}
    />
  )
}
