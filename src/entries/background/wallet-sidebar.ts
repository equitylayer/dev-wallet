import { settingsStore } from '../../zustand'
import { opensSidebar } from './methods'

export function setupWalletSidebarHandler() {
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'openWallet') {
      const { method } = message.payload
      if (opensSidebar(method, settingsStore.getState())) {
        chrome.sidePanel.open({ tabId: sender.tab!.id! })
      }
    }
  })
}
