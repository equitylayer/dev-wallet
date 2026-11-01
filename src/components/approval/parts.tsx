// The approval screens' building blocks: sections, readouts and tinted
// notices, after the Account home's.
import { CircleX, Info, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

import { Box, Button, Text } from '~/design-system'

import * as styles from './approval.css'

export function Section({
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

/** An 11px tertiary label over its value, as on the Account plate. */
export function Readout({
  label,
  title,
  children,
}: { label: string; title?: string; children: ReactNode }) {
  return (
    <Box className={styles.readout} title={title}>
      <Text color="text/tertiary" size="11px" wrap={false}>
        {label}
      </Text>
      <Box className={styles.readoutValue}>{children}</Box>
    </Box>
  )
}

const noticeIcons = {
  red: CircleX,
  yellow: TriangleAlert,
  blue: Info,
}

/**
 * A signal-tinted panel: an icon, a title in the tint's ink, a sentence. A
 * notice that is one sentence leaves out the title.
 */
export function Notice({
  tone,
  title,
  children,
}: {
  tone: 'red' | 'yellow' | 'blue'
  title?: string
  children?: ReactNode
}) {
  const Icon = noticeIcons[tone]
  return (
    <div
      role={tone === 'blue' ? 'note' : 'status'}
      className={styles.notice[tone]}
    >
      <Icon className={styles.noticeIcon[tone]} size={14} strokeWidth={1.75} />
      <Box className={styles.grow}>
        {title && (
          <Box className={styles.noticeTitle[tone]}>
            <Text size="13px" weight="semibold">
              {title}
            </Text>
          </Box>
        )}
        {title && children ? <Box paddingTop="6px">{children}</Box> : children}
      </Box>
    </div>
  )
}

/** A labelled full address with a copy button: who signs or sends. */
export function AddressLine({
  label,
  address,
}: { label: string; address: string }) {
  return (
    <>
      <Text color="text/tertiary" size="11px">
        {label}
      </Text>
      <Box className={styles.address}>
        <Text color="text/secondary" family="mono" size="12px" wrap="anywhere">
          {address}
        </Text>
        <Button.Copy height="20px" text={address} variant="ghost primary" />
      </Box>
    </>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <Box className={styles.empty}>
      <Text color="text/secondary" size="12px">
        {children}
      </Text>
    </Box>
  )
}
