import { keyframes, style } from '@vanilla-extract/css'

import {
  backgroundColorVars,
  foregroundColorVars,
  textColorForBackgroundColorVars,
} from '~/design-system/styles/theme.css'
import { fontFamily } from '~/design-system/tokens'

const rgb = (v: string, a?: number) =>
  a === undefined ? `rgb(${v})` : `rgb(${v} / ${a})`

const ground = backgroundColorVars['surface/primary']
const raised = backgroundColorVars['surface/primary/elevated']
const whisper = backgroundColorVars['surface/fill/quarternary']
const rule = foregroundColorVars['separator/tertiary']
const faint = foregroundColorVars['separator/quarternary']
const accent = foregroundColorVars['text/accent/active']
const activeFill = backgroundColorVars['surface/fill/devwallet/active']
const highlightFill = backgroundColorVars['surface/fill/secondary']
const t1 = foregroundColorVars['text/primary']
const t2 = foregroundColorVars['text/secondary']
const t3 = foregroundColorVars['text/tertiary']

const reset = {
  appearance: 'none',
  background: 'none',
  border: 0,
  margin: 0,
  padding: 0,
  font: 'inherit',
  color: 'inherit',
  textDecoration: 'none',
  cursor: 'pointer',
} as const

////////////////////////////////////////////////////////////////////////
// Account switcher: one bar, a list on demand

export const bar = style({
  display: 'flex',
  alignItems: 'stretch',
  height: 40,
  flexShrink: 0,
  backgroundColor: rgb(ground),
  borderBottom: `1px solid ${rgb(rule)}`,
})

export const barHome = style({
  ...reset,
  display: 'grid',
  placeItems: 'center',
  width: 40,
  flexShrink: 0,
  borderRight: `1px solid ${rgb(faint)}`,
  ':hover': { backgroundColor: rgb(whisper) },
})

export const switcher = style({
  ...reset,
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 12px',
  whiteSpace: 'nowrap',
  color: rgb(t1),
  transition: 'background-color 120ms ease-out',
  ':hover': { backgroundColor: rgb(whisper) },
  selectors: {
    '&[data-state="open"]': {
      backgroundColor: rgb(raised),
      boxShadow: `inset 0 -1.5px 0 ${rgb(accent)}`,
    },
  },
})

export const switcherChevron = style({
  marginLeft: 'auto',
  flexShrink: 0,
  color: rgb(t3),
  transition: 'transform 160ms cubic-bezier(0.16, 1, 0.3, 1)',
  selectors: {
    [`${switcher}[data-state="open"] &`]: { transform: 'rotate(180deg)' },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
})

export const switcherEmpty = style({
  fontSize: 13,
  lineHeight: '17px',
  color: rgb(t3),
})

// Shared by the bar and the list rows: alias, then the short address.
export const accountIcon = style({ flexShrink: 0, color: rgb(t3) })

export const accountName = style({
  flex: '0 1 auto',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  fontFamily: fontFamily.default,
  fontSize: 13,
  lineHeight: '17px',
  fontWeight: 500,
  color: rgb(t1),
})

export const accountAddress = style({
  flexShrink: 0,
  fontFamily: fontFamily.mono,
  fontSize: 12,
  lineHeight: '16px',
  color: rgb(t3),
  selectors: {
    // No alias: the address is the name.
    '&[data-alone]': { color: rgb(t1) },
    '&[data-alone][data-muted]': { color: rgb(t2) },
  },
})

const popIn = keyframes({
  from: { opacity: 0.4, transform: 'translateY(-4px)' },
  to: { opacity: 1, transform: 'none' },
})

export const pop = style({
  zIndex: 10,
  width: 'calc(var(--radix-popover-trigger-width) - 16px)',
  fontFamily: fontFamily.default,
  fontSize: 13,
  lineHeight: '17px',
  color: rgb(t1),
  backgroundColor: rgb(raised),
  border: `1px solid ${rgb(rule)}`,
  boxShadow: '0 14px 32px -12px rgb(0 0 0 / 0.5)',
  outline: 'none',
  animation: `${popIn} 160ms cubic-bezier(0.16, 1, 0.3, 1)`,
  '@media': {
    '(prefers-reduced-motion: reduce)': { animation: 'none' },
  },
})

export const popFilter = style({
  padding: 8,
  borderBottom: `1px solid ${rgb(faint)}`,
})

export const list = style({
  maxHeight: 'min(360px, 55vh)',
  overflowY: 'auto',
  padding: '4px 0',
  selectors: { '&:empty': { display: 'none' } },
})

export const option = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  height: 36,
  padding: '0 10px',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  selectors: {
    '&[data-highlighted]': { backgroundColor: rgb(highlightFill) },
    '&[data-active]': { backgroundColor: rgb(activeFill) },
    // Keyboard focus on the active row still needs to read as focus.
    '&[data-active][data-highlighted]': {
      boxShadow: `inset 0 0 0 1px ${rgb(accent, 0.45)}`,
    },
  },
})

export const optionKey = style({
  width: 10,
  flexShrink: 0,
  textAlign: 'center',
  fontFamily: fontFamily.mono,
  fontSize: 11,
  lineHeight: '15px',
  color: rgb(t3),
})

export const optionBalance = style({
  marginLeft: 'auto',
  paddingLeft: 8,
  flexShrink: 0,
  fontFamily: fontFamily.mono,
  fontSize: 12,
  lineHeight: '16px',
  fontVariantNumeric: 'tabular-nums',
  color: rgb(t2),
})

export const optionCheck = style({
  width: 14,
  height: 14,
  flexShrink: 0,
  color: rgb(accent),
})

export const popNote = style({
  margin: 0,
  padding: '0 10px 10px 30px',
  fontSize: 12,
  lineHeight: '16px',
  color: rgb(t3),
})

export const popEmpty = style({
  margin: 0,
  padding: 10,
  fontSize: 12,
  lineHeight: '16px',
  color: rgb(t2),
})

export const popFoot = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '8px 10px',
  borderTop: `1px solid ${rgb(faint)}`,
  fontSize: 12,
  lineHeight: '16px',
})

export const popFootLink = style({
  ...reset,
  flexShrink: 0,
  color: rgb(t2),
  ':hover': {
    color: rgb(t1),
    textDecoration: 'underline',
    textUnderlineOffset: 2,
  },
})

export const popHint = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: rgb(t3),
})

////////////////////////////////////////////////////////////////////////
// Offline banner

export const offline = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  flexShrink: 0,
  padding: '10px 12px',
  color: rgb(t1),
  backgroundColor: rgb(backgroundColorVars['surface/redTint']),
  borderBottom: `1px solid ${rgb(backgroundColorVars['surface/red'], 0.4)}`,
})

export const offlineTitle = style({
  color: rgb(textColorForBackgroundColorVars['surface/redTint']),
})

export const offlineIcon = style({
  flexShrink: 0,
  marginTop: 1,
  color: rgb(backgroundColorVars['surface/red']),
})

export const offlineAction = style({
  ...reset,
  marginLeft: 'auto',
  flexShrink: 0,
  alignSelf: 'center',
  padding: '4px 8px',
  border: `1px solid ${rgb(backgroundColorVars['surface/red'], 0.5)}`,
  ':hover': { backgroundColor: rgb(backgroundColorVars['surface/red'], 0.12) },
})

////////////////////////////////////////////////////////////////////////
// Footer: bottom nav over the status line

export const footer = style({
  flexShrink: 0,
  backgroundColor: rgb(ground),
  borderTop: `1px solid ${rgb(rule)}`,
})

export const nav = style({
  display: 'flex',
})

export const navItem = style({
  ...reset,
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  height: 36,
  color: rgb(t2),
  borderLeft: `1px solid ${rgb(faint)}`,
  transition: 'background-color 120ms ease-out, color 120ms ease-out',
  ':hover': { backgroundColor: rgb(whisper), color: rgb(t1) },
  selectors: {
    '&:first-child': { borderLeft: 0 },
    '&[aria-current="page"]': {
      color: rgb(t1),
      backgroundColor: rgb(raised),
      boxShadow: `inset 0 1.5px 0 ${rgb(accent)}`,
    },
  },
})

export const status = style({
  containerType: 'inline-size',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  height: 32,
  padding: '0 4px 0 0',
  borderTop: `1px solid ${rgb(faint)}`,
})

export const statusLink = style({
  ...reset,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
  height: '100%',
  padding: '0 6px',
  ':hover': { backgroundColor: rgb(whisper) },
  '@container': {
    '(max-width: 379px)': { gap: 4, padding: '0 4px' },
  },
  selectors: {
    '&:first-child': { paddingLeft: 12, overflow: 'hidden' },
    '&[aria-disabled="true"]': { pointerEvents: 'none' },
  },
})

const tone = {
  '&[data-tone="secondary"]': { color: rgb(t2) },
  '&[data-tone="red"]': { color: rgb(backgroundColorVars['surface/red']) },
}

export const statusText = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontFamily: fontFamily.mono,
  fontSize: 12,
  lineHeight: '16px',
  fontVariantNumeric: 'tabular-nums',
  color: rgb(t1),
  selectors: {
    ...tone,
    // Host and chain are the node's identity: labels give way first.
    '&[data-fixed], &[data-host]': { flexShrink: 0 },
  },
})

export const statusLabel = style({
  flexShrink: 0,
  whiteSpace: 'nowrap',
  fontFamily: fontFamily.default,
  fontSize: 12,
  lineHeight: '16px',
  letterSpacing: 0.1,
  selectors: tone,
})

export const miningMode = style([
  statusLabel,
  {
    '@container': {
      '(max-width: 379px)': { display: 'none' },
    },
  },
])

export const statusSep = style({
  width: 1,
  height: 14,
  flexShrink: 0,
  backgroundColor: rgb(rule),
})

export const statusTools = style({
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
  gap: 5,
  height: 24,
  minWidth: 24,
  padding: '0 6px',
  color: rgb(t2),
  ':hover': { backgroundColor: rgb(whisper), color: rgb(t1) },
  ':disabled': { cursor: 'not-allowed', opacity: 0.4 },
  selectors: {
    '&:disabled:hover': { backgroundColor: 'transparent', color: rgb(t2) },
  },
})

export const mineButton = style([
  toolButton,
  {
    color: rgb(t1),
    border: `1px solid ${rgb(rule)}`,
  },
])

const swing = keyframes({
  '0%': { transform: 'rotate(0deg)' },
  '50%': { transform: 'rotate(45deg)' },
  '100%': { transform: 'rotate(0deg)' },
})

export const mineIcon = style({
  animation: `${swing} 300ms linear`,
  '@media': {
    '(prefers-reduced-motion: reduce)': { animation: 'none' },
  },
})

export const dot = style({
  width: 8,
  height: 8,
  flexShrink: 0,
  borderRadius: 9999,
})
