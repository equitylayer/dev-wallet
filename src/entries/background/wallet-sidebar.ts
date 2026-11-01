import { openWalletMessage } from '~/messengers/transports/guards'
import { senderHost } from '~/utils/host'
import { sessionsStore, settingsStore } from '~/zustand'

import { opensSidebar } from './methods'

export function setupWalletSidebarHandler() {
  chrome.runtime.onMessage.addListener((message, sender) => {
    // A content script's `openWallet`: a method, from a tab.
    const openWallet = openWalletMessage(message)
    const tabId = sender.tab?.id
    if (!openWallet || typeof tabId !== 'number') return
    // The asking frame's own site, as `rpc.ts` checks it (R53). Read now, not
    // after waiting for the stores: the panel opens only in answer to the
    // user's gesture.
    const connected = !!sessionsStore
      .getState()
      .getSession({ host: senderHost(sender) })
    if (
      opensSidebar(openWallet.payload.method, settingsStore.getState(), {
        connected,
      })
    ) {
      chrome.sidePanel.open({ tabId })
    }
  })
}
