import { globalStyle } from '@vanilla-extract/css'

import { fontFamily } from '../tokens'
import { backgroundColorVars, foregroundColorVars } from './theme.css'

globalStyle('html, body', {
  backgroundColor: `rgb(${backgroundColorVars['surface/primary']})`,
  fontFamily: fontFamily.default,
  fontFeatureSettings: '"rlig" 1, "calt" 1',
  fontSize: '16px',
  margin: 0,
  padding: 0,
  border: 0,
  boxSizing: 'border-box',
})

globalStyle('code', {
  fontFamily: fontFamily.mono,
})

globalStyle('pre', {
  margin: 0,
})

// Browser surfaces carry the palette: selection, caret, focus and scrollbars.
const accent = foregroundColorVars['text/accent/active']

globalStyle('::selection', {
  backgroundColor: `rgb(${accent} / 0.28)`,
})

globalStyle('input, textarea', {
  caretColor: `rgb(${accent})`,
})

globalStyle(':focus-visible', {
  outline: `1.5px solid rgb(${accent})`,
  outlineOffset: '-1.5px',
})

globalStyle('input:focus-visible, textarea:focus-visible, select:focus-visible', {
  outline: 'none',
})

globalStyle('*', {
  scrollbarWidth: 'thin',
  scrollbarColor: `rgb(${foregroundColorVars['separator/tertiary']}) transparent`,
})
