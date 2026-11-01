import { openWalletMessage } from '~/messengers/transports/guards'

import { settingsStore } from '../../zustand'
import { opensSidebar } from './methods'

export function setupWalletSidebarHandler() {
  chrome.runtime.onMessage.addListener((message, sender) => {
    // A content script's `openWallet`: a method, from a tab.
    const openWallet = openWalletMessage(message)
    const tabId = sender.tab?.id
    if (!openWallet || typeof tabId !== 'number') return
    if (opensSidebar(openWallet.payload.method, settingsStore.getState())) {
      chrome.sidePanel.open({ tabId })
    }
  })
}
