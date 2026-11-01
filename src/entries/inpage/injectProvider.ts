import { type EIP1193Provider, announceProvider } from 'mipd'

import { getMessenger } from '~/messengers'
import { getProvider } from '~/provider'

const backgroundMessenger = getMessenger('background:inpage')
const walletMessenger = getMessenger('wallet:inpage')

// The Docked D, dark version: dApps show it in their wallet pickers on any
// background, so it can't follow DevWallet's theme. Matches
// public/icons/devwallet-logo.svg.
function generateBrandIcon(): `data:image/${string}` {
    const d =
        'M14.375 15.25H31.625C41.298 15.25 49.375 22.74 49.375 32C49.375 41.26 41.298 48.75 31.625 48.75H14.375Z M23.5 24.375V39.625H31.625C36.375 39.625 40.25 36.245 40.25 32C40.25 27.755 36.375 24.375 31.625 24.375Z'
    const svg = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="docked"><rect x="40" y="0" width="24" height="64"/></clipPath></defs>
    <rect x="2" y="2" width="60" height="60" rx="14.5" fill="#191A1C"/>
    <path d="${d}" fill="#FFFFFF" fill-rule="evenodd"/>
    <path d="${d}" fill="#F9B64F" fill-rule="evenodd" clip-path="url(#docked)"/>
    <rect x="36" y="14" width="4" height="36" fill="#191A1C"/>
  </svg>`
    return `data:image/svg+xml,${encodeURIComponent(
        svg,
    )}` as `data:image/${string}`
}

export function injectProvider() {
    const provider = getProvider({
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
            uuid: crypto.randomUUID(),
        },
        provider: provider as EIP1193Provider,
    })
}
