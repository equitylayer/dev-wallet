import { useId } from 'react'

export function DevWalletIcon({ size }: { size: string }) {
  const id = useId()
  const backgroundId = `${id}-devwallet-icon-background`
  const promptId = `${id}-devwallet-icon-prompt`

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      style={{
        height: size,
        width: size,
      }}
    >
      <title>DevWallet Icon</title>
      <rect
        x={32}
        y={32}
        width={960}
        height={960}
        rx={232}
        fill={`url(#${backgroundId})`}
      />
      <path
        d="M230 244H506C660.773 244 790 363.837 790 512C790 660.163 660.773 780 506 780H230V244ZM376 390V634H506C581.994 634 644 579.918 644 512C644 444.082 581.994 390 506 390H376Z"
        fill="#F4F8EF"
        fillRule="evenodd"
      />
      <path
        d="M474 456L542 512L474 568"
        stroke={`url(#${promptId})`}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={64}
      />
      <path
        d="M572 604H670"
        stroke="#F4F8EF"
        strokeLinecap="round"
        strokeWidth={58}
      />
      <defs>
        <linearGradient
          id={backgroundId}
          x1={132}
          x2={900}
          y1={84}
          y2={956}
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#172824" />
          <stop offset={0.5} stopColor="#10161A" />
          <stop offset={1} stopColor="#171B24" />
        </linearGradient>
        <linearGradient
          id={promptId}
          x1={474}
          x2={542}
          y1={456}
          y2={568}
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#83FFA1" />
          <stop offset={1} stopColor="#49DBE9" />
        </linearGradient>
      </defs>
    </svg>
  )
}
