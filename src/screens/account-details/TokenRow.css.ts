import { style } from '@vanilla-extract/css'

import {
  backgroundColorVars,
  foregroundColorVars,
} from '~/design-system/styles/theme.css'

export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minHeight: 48,
  padding: '8px 12px',
  borderBottom: `1px solid rgb(${foregroundColorVars['separator/quarternary']})`,
  ':hover': {
    backgroundColor: `rgb(${backgroundColorVars['surface/fill/quarternary']})`,
  },
})

// Inside an 8px-inset container the row bleeds back to the panel edge.
export const bleed = style({
  margin: '0 -8px',
  padding: '8px',
})

export const main = style({ flex: 1, minWidth: 0 })

export const end = style({ flexShrink: 0 })

export const metaText = style({ flex: '0 1 auto', minWidth: 0 })

export const meta = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  minWidth: 0,
  paddingTop: 6,
})

// Copy and hide stay quiet until the row is hovered or focused.
export const tools = style({
  display: 'flex',
  flexShrink: 0,
  opacity: 0,
  transition: 'opacity 120ms ease-out',
  selectors: {
    [`${row}:hover &, ${row}:focus-within &`]: { opacity: 1 },
  },
})
