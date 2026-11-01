import { keyframes, style } from '@vanilla-extract/css'

import {
  backgroundColorVars,
  foregroundColorVars,
} from '~/design-system/styles/theme.css'

const rgb = (v: string, a?: number) =>
  a === undefined ? `rgb(${v})` : `rgb(${v} / ${a})`

const whisper = backgroundColorVars['surface/fill/quarternary']
const rule = foregroundColorVars['separator/tertiary']
const faint = foregroundColorVars['separator/quarternary']
const accent = foregroundColorVars['text/accent/active']
const t2 = foregroundColorVars['text/secondary']
const t3 = foregroundColorVars['text/tertiary']

const gutter = 12

export const scroll = style({
  boxSizing: 'border-box',
  height: '100%',
  overflowY: 'auto',
  paddingBottom: 16,
})

// The one authored motion: on switch the plate takes a wash of the accent
// and lets it go, so the eye registers who you are acting as now.
const arrive = keyframes({
  from: { backgroundColor: rgb(accent, 0.12) },
  to: { backgroundColor: 'transparent' },
})

export const plate = style({
  padding: `16px ${gutter}px`,
  borderBottom: `1px solid ${rgb(rule)}`,
  animation: `${arrive} 600ms cubic-bezier(0.16, 1, 0.3, 1)`,
  '@media': {
    '(prefers-reduced-motion: reduce)': { animation: 'none' },
  },
})

export const identity = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 25,
})

export const tag = style({
  flexShrink: 0,
  padding: '2px 6px',
  border: `1px solid ${rgb(rule)}`,
  color: rgb(t2),
})

export const addAlias = style({
  appearance: 'none',
  background: 'none',
  border: 0,
  padding: 0,
  cursor: 'pointer',
  color: rgb(t3),
  ':hover': { color: rgb(t2) },
})

export const buttonContent = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
})

export const identityTools = style({
  display: 'flex',
  marginLeft: 'auto',
  flexShrink: 0,
})

export const address = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  marginTop: 6,
})

export const readouts = style({
  display: 'grid',
  gridTemplateColumns: '1.5fr 1fr 1fr',
  marginTop: 16,
})

export const readout = style({
  minWidth: 0,
  paddingRight: gutter,
  selectors: {
    '& + &': {
      paddingLeft: gutter,
      borderLeft: `1px solid ${rgb(rule)}`,
    },
  },
})

export const readoutValue = style({
  display: 'flex',
  // Capsize trims each line to cap height and baseline, so bottom edges
  // are baselines.
  alignItems: 'flex-end',
  gap: 4,
  minHeight: 24,
  paddingTop: 8,
})

export const actions = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 16,
})

export const grow = style({ flex: 1, minWidth: 0 })

// Single-line Text is width: 100%; in a flex row it needs a sized cell.
export const shrink = style({ flex: '0 1 auto', minWidth: 0 })

export const section = style({
  marginTop: 16,
})

export const sectionHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  minHeight: 32,
  padding: `0 ${gutter}px`,
  borderBottom: `1px solid ${rgb(rule)}`,
})

export const textButton = style({
  appearance: 'none',
  background: 'none',
  border: 0,
  padding: '4px 0',
  cursor: 'pointer',
  color: rgb(t2),
  textDecoration: 'none',
  ':hover': {
    color: rgb(foregroundColorVars['text/primary']),
    textDecoration: 'underline',
    textUnderlineOffset: 2,
  },
})

export const sectionBody = style({
  padding: `8px ${gutter}px`,
  borderBottom: `1px solid ${rgb(faint)}`,
})

export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minHeight: 48,
  padding: `8px ${gutter}px`,
  borderBottom: `1px solid ${rgb(faint)}`,
  color: 'inherit',
  textDecoration: 'none',
})

export const rowLink = style([
  row,
  { ':hover': { backgroundColor: rgb(whisper) } },
])

export const rowIcon = style({
  flexShrink: 0,
  color: rgb(t3),
})

export const rowMain = style({
  flex: 1,
  minWidth: 0,
})

export const rowEnd = style({
  flexShrink: 0,
  textAlign: 'right',
})

export const pill = style({
  display: 'inline-flex',
  flexShrink: 0,
  padding: '2px 5px',
  border: `1px solid ${rgb(rule)}`,
  color: rgb(t2),
})

export const pillGreen = style([
  pill,
  {
    borderColor: rgb(backgroundColorVars['surface/green'], 0.55),
    color: rgb(backgroundColorVars['surface/green']),
  },
])

export const empty = style({
  padding: `12px ${gutter}px`,
  borderBottom: `1px solid ${rgb(faint)}`,
})

export const more = style({
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: `4px ${gutter}px`,
  borderBottom: `1px solid ${rgb(faint)}`,
})

// Inside an 8px-inset container the row bleeds back to the panel edge.
export const moreBleed = style([
  more,
  {
    margin: '0 -8px',
    padding: '4px 8px',
  },
])
