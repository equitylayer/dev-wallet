import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Box, Text } from '~/design-system'

import * as styles from './approval.css'

/**
 * A screen that asks for a decision: a title and who asks, the body scrolling
 * on its own, and the actions pinned under it.
 */
export function ApprovalFrame({
  title,
  subtitle,
  onClose,
  footer,
  children,
}: {
  title: string
  /** Who asks, or what the screen holds; one line of tertiary text. */
  subtitle?: ReactNode
  onClose?: () => void
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={styles.frame}>
      <header className={styles.header}>
        <Box className={styles.grow}>
          <Text as="h1" size="16px" weight="medium">
            {title}
          </Text>
          {subtitle && (
            <Box paddingTop="8px">
              <Text color="text/tertiary" size="12px">
                {subtitle}
              </Text>
            </Box>
          )}
        </Box>
        {onClose && (
          <button
            type="button"
            aria-label="Close"
            className={styles.toolButton}
            onClick={onClose}
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        )}
      </header>
      <div className={styles.body}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  )
}
