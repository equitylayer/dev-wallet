import { Box, Text } from '~/design-system'

import * as styles from './approval/approval.css'

/**
 * An activity row's tags: Sponsored, naming who paid the gas in its title,
 * and Reverted, for user operations whose calls reverted. They wear the
 * approval screens' signal tags (DESIGN.md's Tag: 2px 6px, 11px medium).
 */
export function ActivityTags({
  payer,
  reverted,
}: {
  payer?: string
  reverted: boolean
}) {
  return (
    <>
      {payer && (
        <Box className={styles.tagGreen} title={`Gas paid by ${payer}`}>
          <Text size="11px" weight="medium" wrap={false}>
            Sponsored
          </Text>
        </Box>
      )}
      {reverted && (
        <Box
          className={styles.tagRed}
          title="The user operation reverted, so its calls had no effect."
        >
          <Text size="11px" weight="medium" wrap={false}>
            Reverted
          </Text>
        </Box>
      )}
    </>
  )
}
