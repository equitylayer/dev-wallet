import { style } from '@vanilla-extract/css'
import { keyframes } from '@vanilla-extract/css'

const mineAnimation = keyframes({
  '0%': {
    transform: 'rotate(0deg)',
  },
  '50%': {
    transform: 'rotate(45deg)',
  },
  '100%': {
    transform: 'rotate(0deg)',
  },
})

export const mineSymbol = style({
  animationName: mineAnimation,
  animationDuration: '0.3s',
  animationTimingFunction: 'linear',
})
