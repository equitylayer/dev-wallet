import { v4 as uuidv4 } from '@lukeed/uuid'
import { type EIP1193Provider, announceProvider } from 'mipd'

import { getMessenger } from '~/messengers'
import { getProvider } from '~/provider'

const backgroundMessenger = getMessenger('background:inpage')
const walletMessenger = getMessenger('wallet:inpage')

// Generate SVG icon based on DW logo
function generateBrandIcon(): `data:image/${string}` {
  const svg = `<svg viewBox="0 0 1108 1008" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" width="1000" height="1000" fill="black"/>
    <path d="M130 755V395H430C441 395 451 397.667 460 403C469.333 408.333 476.667 415.667 482 425C487.333 434 490 444 490 455V695C490 706 487.333 716.167 482 725.5C476.667 734.5 469.333 741.667 460 747C451 752.333 441 755 430 755H130ZM190 714.5H430C435.333 714.5 439.833 712.667 443.5 709C447.5 705 449.5 700.333 449.5 695V455C449.5 449.667 447.5 445.167 443.5 441.5C439.833 437.5 435.333 435.5 430 435.5H190C184.667 435.5 180 437.5 176 441.5C172.333 445.167 170.5 449.667 170.5 455V695C170.5 700.333 172.333 705 176 709C180 712.667 184.667 714.5 190 714.5ZM666.492 755L535.492 395H578.492L683.992 684L788.992 395H837.992L943.492 684L1047.99 395H1091.99L960.992 755H925.492L813.492 447.5L701.492 755H666.492Z" fill="white"/>
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
  // This allows dapps to discover DevWallet even when other wallets are present
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
