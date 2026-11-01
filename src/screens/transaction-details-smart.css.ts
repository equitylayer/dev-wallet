// The transaction details' EIP-7702 and user-operation sections, after the
// approval screens' (approval.css.ts): a 12px gutter, a paper rule under the
// section header, faint rules between blocks, square corners.
import { style } from '@vanilla-extract/css'

import { foregroundColorVars } from '~/design-system/styles/theme.css'

const rgb = (v: string) => `rgb(${v})`

const faint = foregroundColorVars['separator/quarternary']

const gutter = 12

/** One authorization, or one operation's readouts. */
export const block = style({
  padding: `12px ${gutter}px`,
  borderBottom: `1px solid ${rgb(faint)}`,
})
