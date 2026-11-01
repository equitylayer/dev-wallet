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
// Account strip

export const strip = style({
  display: 'flex',
  alignItems: 'stretch',
  height: 40,
  flexShrink: 0,
  backgroundColor: rgb(ground),
  borderBottom: `1px solid ${rgb(rule)}`,
})

export const stripHome = style({
  ...reset,
  display: 'grid',
  placeItems: 'center',
  width: 40,
  flexShrink: 0,
  borderRight: `1px solid ${rgb(faint)}`,
  ':hover': { backgroundColor: rgb(whisper) },
})

// The trailing fade says "there is more" when chips overflow.
const fade = 'linear-gradient(to right, #000 calc(100% - 24px), transparent)'

export const chips = style({
  display: 'flex',
  alignItems: 'stretch',
  flex: 1,
  minWidth: 0,
  overflowX: 'auto',
  scrollbarWidth: 'none',
  maskImage: fade,
  WebkitMaskImage: fade,
  selectors: { '&::-webkit-scrollbar': { display: 'none' } },
})

export const chip = style({
  ...reset,
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
  padding: '0 12px',
  color: rgb(t2),
  borderRight: `1px solid ${rgb(faint)}`,
  transition: 'background-color 120ms ease-out, color 120ms ease-out',
  ':hover': { backgroundColor: rgb(whisper), color: rgb(t1) },
  selectors: {
    '&[aria-current="true"]': {
      cursor: 'default',
      color: rgb(t1),
      backgroundColor: rgb(raised),
      boxShadow: `inset 0 -1.5px 0 ${rgb(accent)}`,
    },
  },
})

export const chipIcon = style({ color: rgb(t3), flexShrink: 0 })

export const chipKey = style({
  flexShrink: 0,
  fontFamily: fontFamily.mono,
  fontSize: 11,
  lineHeight: '15px',
  color: rgb(t3),
})

export const stripAll = style({
  ...reset,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
  padding: '0 12px',
  color: rgb(t2),
  borderLeft: `1px solid ${rgb(rule)}`,
  ':hover': { backgroundColor: rgb(whisper), color: rgb(t1) },
  selectors: {
    '&[aria-current="page"]': {
      color: rgb(t1),
      boxShadow: `inset 0 -1.5px 0 ${rgb(accent)}`,
    },
  },
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
