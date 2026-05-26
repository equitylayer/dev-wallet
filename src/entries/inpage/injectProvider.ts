import { v4 as uuidv4 } from '@lukeed/uuid'
import { type EIP1193Provider, announceProvider } from 'mipd'

import { getMessenger } from '~/messengers'
import { getProvider } from '~/provider'

const backgroundMessenger = getMessenger('background:inpage')
const walletMessenger = getMessenger('wallet:inpage')

// Generate SVG icon based on the extension app icon.
function generateBrandIcon(): `data:image/${string}` {
  const svg = `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <rect x="32" y="32" width="960" height="960" rx="232" fill="url(#background)"/>
    <path d="M230 244H506C660.773 244 790 363.837 790 512C790 660.163 660.773 780 506 780H230V244ZM376 390V634H506C581.994 634 644 579.918 644 512C644 444.082 581.994 390 506 390H376Z" fill="#F4F8EF" fill-rule="evenodd"/>
    <path d="M474 456L542 512L474 568" stroke="url(#prompt)" stroke-width="64" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M572 604H670" stroke="#F4F8EF" stroke-width="58" stroke-linecap="round"/>
    <defs>
      <linearGradient id="background" x1="132" y1="84" x2="900" y2="956" gradientUnits="userSpaceOnUse">
        <stop stop-color="#172824"/>
        <stop offset="0.5" stop-color="#10161A"/>
        <stop offset="1" stop-color="#171B24"/>
      </linearGradient>
      <linearGradient id="prompt" x1="474" y1="456" x2="542" y2="568" gradientUnits="userSpaceOnUse">
        <stop stop-color="#83FFA1"/>
        <stop offset="1" stop-color="#49DBE9"/>
      </linearGradient>
    </defs>
  </svg>`
  return `data:image/svg+xml,${encodeURIComponent(
    svg,
  )}` as `data:image/${string}`
}

export function injectProvider() {
  const provider = getProvider({
    host: window.location.host,
    eventMessenger: [walletMessenger, backgroundMessenger],
    requestMessenger: backgroundMessenger,
  })

  // Only inject to window.ethereum if no other wallet exists
  // This prevents conflicts with MetaMask, Coinbase, etc.
  const hasExistingWallet = !!window.ethereum
  if (!hasExistingWallet) {
    window.ethereum = provider
    window.dispatchEvent(new Event('ethereum#initialized'))
  }

  // Re-inject provider on demand (for compatibility)
  walletMessenger.reply('injectProvider', async () => {
    if (!hasExistingWallet) {
      window.ethereum = provider
    }
  })

  // Announce provider via EIP-6963 (modern multi-wallet support)
  announceProvider({
    info: {
      icon: generateBrandIcon(),
      name: 'DevWallet',
      rdns: 'wallet.devwallet',
      uuid: uuidv4(),
    },
    provider: provider as EIP1193Provider,
  })
}
