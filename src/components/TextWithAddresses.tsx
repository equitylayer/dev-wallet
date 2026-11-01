import { Fragment } from 'react'

import { Text } from '~/design-system'
import { truncate } from '~/utils'

// Splitting on a capture group keeps the addresses, at the odd indices.
const ADDRESS = /(0x[0-9a-fA-F]{40})/

/**
 * A sentence whose addresses are set in mono, as data is. Render it inside a
 * `Text`, which gives the size and ink. `short` truncates each address in
 * the middle, for rows too narrow to hold one.
 */
export function TextWithAddresses({
  text,
  short = false,
}: { text: string; short?: boolean }) {
  return (
    <>
      {text.split(ADDRESS).map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} as="span" family="mono">
            {short ? truncate(part, { start: 6, end: 4 }) : part}
          </Text>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  )
}
