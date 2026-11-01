// The transaction details' EIP-7702 and user-operation sections, after the
// approval screens' (approval.css.ts): a 12px gutter, a paper rule under the
// section header, faint rules between blocks, square corners.
import { style } from '@vanilla-extract/css'

import { faint, gutter } from '~/components/approval/approval.css'
import { rgb } from '~/components/approval/rgb'

/** One authorization, or one operation's readouts. */
export const block = style({
  padding: `12px ${gutter}px`,
  borderBottom: `1px solid ${rgb(faint)}`,
})
