import { useId } from 'react'

import {
  backgroundColorVars,
  foregroundColorVars,
} from '~/design-system/styles/theme.css'

// The Docked D: today's D cut once, top to bottom, with the right of the bowl
// in the theme accent as the panel docked beside the page. Drawn on a 64-unit
// grid; public/icons/devwallet-logo.svg is the same mark at 1024 (dark only).
const D =
  'M14.375 15.25H31.625C41.298 15.25 49.375 22.74 49.375 32C49.375 41.26 41.298 48.75 31.625 48.75H14.375Z M23.5 24.375V39.625H31.625C36.375 39.625 40.25 36.245 40.25 32C40.25 27.755 36.375 24.375 31.625 24.375Z'

export function DevWalletIcon({ size }: { size: string }) {
  const panelId = `${useId().replace(/:/g, '')}-docked-panel`
  const tile = `rgb(${backgroundColorVars['surface/primary/elevated']})`
  const ink = foregroundColorVars['text/primary']

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      style={{
        height: size,
        width: size,
      }}
    >
      <title>DevWallet</title>
      <defs>
        <clipPath id={panelId}>
          <rect x={40} y={0} width={24} height={64} />
        </clipPath>
      </defs>
      <rect
        x={2}
        y={2}
        width={60}
        height={60}
        rx={14.5}
        fill={tile}
        stroke={`rgb(${ink} / 0.14)`}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <path d={D} fill={`rgb(${ink})`} fillRule="evenodd" />
      <path
        d={D}
        fill={`rgb(${backgroundColorVars['surface/accent']})`}
        fillRule="evenodd"
        clipPath={`url(#${panelId})`}
      />
      <rect x={36} y={14} width={4} height={36} fill={tile} />
    </svg>
  )
}
