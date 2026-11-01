import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { hexToBigInt, size } from 'viem'

import { DecodedCalldata } from '~/components'
import { FormattedAbiFunctionName } from '~/components/abi/FormattedAbiFunctionName'
import { Box, Text } from '~/design-system'
import type { RpcCall } from '~/smart/types'
import { truncate } from '~/utils'
import { ethAmount } from '~/utils/sendPreview'

import * as styles from './approval.css'

function CallTitle({ call }: { call: RpcCall }) {
  if (!call.to)
    return (
      <Text size="13px" weight="medium" wrap={false}>
        Deploy contract
      </Text>
    )
  if (call.data && call.data !== '0x')
    return <FormattedAbiFunctionName data={call.data} />
  return (
    <Text size="13px" weight="medium" wrap={false}>
      Transfer
    </Text>
  )
}

/**
 * One call of a send: what it calls, where, and the ETH it carries. A call
 * with calldata opens to show it decoded. `failed` marks the call the
 * simulation expects to revert.
 */
export function CallRow({
  index,
  call,
  failed = false,
}: { index: number; call: RpcCall; failed?: boolean }) {
  const [open, setOpen] = useState(false)
  // A deployment's data is its code: nothing to decode.
  const hasData = Boolean(call.to && call.data && call.data !== '0x')
  const value = ethAmount(call.value ? hexToBigInt(call.value) : 0n)

  const content = (
    <>
      <Box className={styles.callIndex}>
        <Text color="text/tertiary" family="mono" size="11px" tabular>
          {index + 1}
        </Text>
      </Box>
      <Box className={styles.grow}>
        <Box className={styles.inline}>
          <Box className={styles.shrink}>
            <CallTitle call={call} />
          </Box>
          {failed && (
            <Box className={styles.tagRed}>
              <Text size="11px" weight="medium" wrap={false}>
                Reverts
              </Text>
            </Box>
          )}
        </Box>
        <Box paddingTop="6px">
          <Text color="text/tertiary" family="mono" size="12px" wrap={false}>
            {call.to
              ? `to ${truncate(call.to, { start: 6, end: 4 })}`
              : `${call.data ? size(call.data) : 0} bytes of code`}
          </Text>
        </Box>
      </Box>
      <Box className={styles.end}>
        <Text align="right" family="mono" size="13px" tabular wrap={false}>
          {value.amount}{' '}
          <Text color="text/tertiary" size="11px">
            {value.unit}
          </Text>
        </Text>
      </Box>
      {hasData ? (
        <ChevronDown className={styles.chevron} size={14} strokeWidth={1.75} />
      ) : (
        <span className={styles.chevronSlot} />
      )}
    </>
  )

  return (
    <div className={styles.call}>
      {hasData ? (
        <button
          type="button"
          aria-expanded={open}
          className={styles.callRow}
          title={call.to}
          onClick={() => setOpen((x) => !x)}
        >
          {content}
        </button>
      ) : (
        <div className={styles.callRow} title={call.to}>
          {content}
        </div>
      )}
      {open && call.data && (
        <Box className={styles.callDetail}>
          <DecodedCalldata address={call.to} data={call.data} showRawData />
        </Box>
      )}
    </div>
  )
}
