import { Text } from '~/design-system'

import * as styles from '../account-home/account-home.css'

/** The "Show N empty" / "Hide empty" control for collapsed empty tokens. */
export function EmptyTokensToggle({
  count,
  open,
  onToggle,
}: {
  count: number
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className={styles.textButton}
      aria-expanded={open}
      onClick={onToggle}
    >
      <Text size="12px" wrap={false}>
        {open ? 'Hide empty' : `Show ${count} empty`}
      </Text>
    </button>
  )
}
