import { style } from '@vanilla-extract/css'

import { foregroundColorVars } from '~/design-system/styles/theme.css'

const rgb = (v: string) => `rgb(${v})`

const rule = foregroundColorVars['separator/tertiary']
const faint = foregroundColorVars['separator/quarternary']
const t3 = foregroundColorVars['text/tertiary']

const row = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
} as const

// The open batch, at the top of the footer band: it stays in view on every
// screen, over the bottom nav, on the ground like the rest of the chrome.
export const bar = style({
  ...row,
  minHeight: 44,
  boxSizing: 'border-box',
  borderBottom: `1px solid ${rgb(faint)}`,
})

// "Start batch" on the Account home: a row under the plate.
export const slot = style({
  ...row,
  minHeight: 48,
  borderBottom: `1px solid ${rgb(rule)}`,
})

export const icon = style({ flexShrink: 0, color: rgb(t3) })

export const main = style({ flex: 1, minWidth: 0 })

export const actions = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
})
