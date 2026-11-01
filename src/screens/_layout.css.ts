import { style } from '@vanilla-extract/css'


export const shell = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  width: '100%',
  overflow: 'hidden',
})

export const content = style({
  position: 'relative',
  flex: 1,
  minHeight: 0,
  width: '100%',
  overflow: 'hidden',
})
