// The approval screens and the batch review: a frame (header, scrolling body,
// actions), the send summary, and call rows. The recipe is the Account home's
// (account-home.css.ts): a 12px gutter, paper rules between blocks, faint
// rules between rows, square corners.
import { globalStyle, style, styleVariants } from '@vanilla-extract/css'

import {
  backgroundColorVars,
  foregroundColorVars,
  textColorForBackgroundColorVars,
} from '~/design-system/styles/theme.css'
import { fontFamily } from '~/design-system/tokens'

import { rgb } from './rgb'

const whisper = backgroundColorVars['surface/fill/quarternary']
const recess = backgroundColorVars['surface/secondary']
const rule = foregroundColorVars['separator/tertiary']
export const faint = foregroundColorVars['separator/quarternary']
const t1 = foregroundColorVars['text/primary']
const t2 = foregroundColorVars['text/secondary']
const t3 = foregroundColorVars['text/tertiary']

export const gutter = 12

const reset = {
  appearance: 'none',
  background: 'none',
  border: 0,
  margin: 0,
  padding: 0,
  font: 'inherit',
  color: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
} as const

////////////////////////////////////////////////////////////////////////
// Frame

export const frame = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
})

export const header = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  flexShrink: 0,
  padding: `16px ${gutter}px 12px`,
  borderBottom: `1px solid ${rgb(rule)}`,
})

export const grow = style({ flex: 1, minWidth: 0 })

export const body = style({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  paddingBottom: 16,
})

export const footer = style({
  flexShrink: 0,
  padding: `8px ${gutter}px`,
  borderTop: `1px solid ${rgb(rule)}`,
})

export const footerNote = style({
  paddingBottom: 8,
})

export const actions = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
})

export const fit = style({ flexShrink: 0 })

////////////////////////////////////////////////////////////////////////
// Blocks and sections

/** A block of the body, like the Account plate: padded, ruled beneath. */
export const block = style({
  padding: `16px ${gutter}px`,
  borderBottom: `1px solid ${rgb(rule)}`,
})

export const section = style({ marginTop: 16 })

export const sectionHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  minHeight: 32,
  padding: `0 ${gutter}px`,
  borderBottom: `1px solid ${rgb(rule)}`,
})

export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minHeight: 40,
  padding: `8px ${gutter}px`,
  borderBottom: `1px solid ${rgb(faint)}`,
})

export const empty = style({
  padding: `12px ${gutter}px`,
  borderBottom: `1px solid ${rgb(faint)}`,
})

export const end = style({
  flexShrink: 0,
  textAlign: 'right',
})

// Single-line Text is width: 100%; in a flex row it needs a sized cell.
export const shrink = style({ flex: '0 1 auto', minWidth: 0 })

export const inline = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
})

export const address = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  marginTop: 8,
})

/** Hex that may be long: a sunken box, wrapping anywhere. */
export const hexBox = style({
  marginTop: 8,
  padding: '10px 12px',
  backgroundColor: rgb(recess),
  wordBreak: 'break-all',
})

////////////////////////////////////////////////////////////////////////
// Readouts (label above value, as on the plate)

export const readouts = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  rowGap: 16,
  marginTop: 16,
})

export const readout = style({
  minWidth: 0,
  paddingRight: gutter,
  selectors: {
    '&:nth-child(even)': {
      paddingLeft: gutter,
      borderLeft: `1px solid ${rgb(rule)}`,
    },
  },
})

export const readoutValue = style({
  display: 'flex',
  alignItems: 'flex-end',
  flexWrap: 'wrap',
  gap: 4,
  paddingTop: 8,
})

////////////////////////////////////////////////////////////////////////
// Transaction fields: gas readouts, and the Edit state's inputs

export const fieldGrid = style([readouts, { marginTop: 0 }])

/** A full-width field: its label above a 24px input. */
export const field = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  marginBottom: 12,
})

export const fieldInput = style({ flexGrow: 1, minWidth: 0 })

/** Hex and addresses in inputs wear Data Small, as everywhere else. */
export const monoInput = style([fieldInput])
globalStyle(`${monoInput} input`, { fontFamily: fontFamily.mono })

export const editActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 16,
})

////////////////////////////////////////////////////////////////////////
// Status and notices

export const status = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  marginTop: 16,
})

export const statusIcon = styleVariants({
  ok: { flexShrink: 0, color: rgb(backgroundColorVars['surface/green']) },
  neutral: { flexShrink: 0, color: rgb(t3) },
  warn: { flexShrink: 0, color: rgb(backgroundColorVars['surface/yellow']) },
})

// A preview of other calls, or one that failed to refresh: still there to
// read, but not the current word.
export const stale = style({ opacity: 0.45 })

const tint = (
  signal: 'surface/red' | 'surface/yellow' | 'surface/blue',
  wash: 'surface/redTint' | 'surface/yellowTint' | 'surface/blueTint',
) =>
  ({
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 16,
    padding: '10px 12px',
    color: rgb(t1),
    backgroundColor: rgb(backgroundColorVars[wash]),
    border: `1px solid ${rgb(backgroundColorVars[signal], 0.4)}`,
  }) as const

/** A panel in a signal's tint: an icon, a titled sentence, its own ink. */
export const notice = styleVariants({
  red: tint('surface/red', 'surface/redTint'),
  yellow: tint('surface/yellow', 'surface/yellowTint'),
  blue: tint('surface/blue', 'surface/blueTint'),
})

export const noticeIcon = styleVariants({
  red: { flexShrink: 0, color: rgb(backgroundColorVars['surface/red']) },
  yellow: { flexShrink: 0, color: rgb(backgroundColorVars['surface/yellow']) },
  blue: { flexShrink: 0, color: rgb(backgroundColorVars['surface/blue']) },
})

export const noticeTitle = styleVariants({
  red: { color: rgb(textColorForBackgroundColorVars['surface/redTint']) },
  yellow: { color: rgb(textColorForBackgroundColorVars['surface/yellowTint']) },
  blue: { color: rgb(textColorForBackgroundColorVars['surface/blueTint']) },
})

////////////////////////////////////////////////////////////////////////
// Tags

export const tag = style({
  display: 'inline-flex',
  flexShrink: 0,
  padding: '2px 6px',
  border: `1px solid ${rgb(rule)}`,
  color: rgb(t2),
})

export const tagRed = style([
  tag,
  {
    borderColor: rgb(backgroundColorVars['surface/red'], 0.55),
    color: rgb(backgroundColorVars['surface/red']),
  },
])

export const tagYellow = style([
  tag,
  {
    borderColor: rgb(backgroundColorVars['surface/yellow'], 0.55),
    color: rgb(foregroundColorVars['text/primary']),
  },
])

export const tagGreen = style([
  tag,
  {
    borderColor: rgb(backgroundColorVars['surface/green'], 0.55),
    color: rgb(backgroundColorVars['surface/green']),
  },
])

////////////////////////////////////////////////////////////////////////
// Calls

export const call = style({
  borderBottom: `1px solid ${rgb(faint)}`,
})

export const callRow = style({
  ...reset,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  minHeight: 44,
  padding: `8px ${gutter}px`,
  cursor: 'default',
  selectors: {
    'button&': { cursor: 'pointer' },
    'button&:hover': { backgroundColor: rgb(whisper) },
  },
})

export const callIndex = style({
  flexShrink: 0,
  minWidth: 16,
})

export const callDetail = style({
  padding: `4px ${gutter}px 12px ${gutter + 26}px`,
})

export const chevron = style({
  flexShrink: 0,
  color: rgb(t3),
  transition: 'transform 160ms cubic-bezier(0.16, 1, 0.3, 1)',
  selectors: {
    '[aria-expanded="true"] &': { transform: 'rotate(180deg)' },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
})

/** The space a chevron takes, on rows without one, so values line up. */
export const chevronSlot = style({ flexShrink: 0, width: 14 })

////////////////////////////////////////////////////////////////////////
// Batch review: one block per queued request

export const request = style({
  borderBottom: `1px solid ${rgb(rule)}`,
})

export const requestHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 40,
  padding: `6px 4px 6px ${gutter}px`,
  backgroundColor: rgb(recess),
  borderBottom: `1px solid ${rgb(faint)}`,
})

export const tools = style({
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  marginLeft: 'auto',
  flexShrink: 0,
})

export const toolButton = style({
  ...reset,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  color: rgb(t2),
  ':hover': { backgroundColor: rgb(whisper), color: rgb(t1) },
  ':disabled': { cursor: 'not-allowed', opacity: 0.4 },
  selectors: {
    '&:disabled:hover': { backgroundColor: 'transparent', color: rgb(t2) },
  },
})
