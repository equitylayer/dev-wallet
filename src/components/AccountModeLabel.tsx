import type { Address } from 'viem'

import { Box, Text } from '~/design-system'
import { modeLabel, useAccountMode } from '~/hooks/useAccountMode'

import { TextWithAddresses } from './TextWithAddresses'

/**
 * An account's mode in a row's metadata ("Smart · Kernel v3.3"), with a
 * foreign delegation's target truncated; the full label is the title. A dash
 * while the account's code loads.
 */
export function AccountModeLabel({ address }: { address: Address }) {
  const { mode, onchain } = useAccountMode(address)
  const label = mode && onchain ? modeLabel(mode, onchain) : undefined

  return (
    <Box title={label}>
      <Text color="text/tertiary" size="11px" wrap={false}>
        {label ? <TextWithAddresses short text={label} /> : '—'}
      </Text>
    </Box>
  )
}
