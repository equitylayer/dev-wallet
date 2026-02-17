function createContextMenuItem(item: chrome.contextMenus.CreateProperties) {
  chrome.contextMenus.create(item, () => {
    const error = chrome.runtime?.lastError
    if (error) console.warn('Context menu creation failed', error)
  })
}

export async function setupContextMenu() {
  try {
    await chrome.contextMenus.removeAll()
  } catch (error) {
    console.warn('Failed to clear context menus', error)
  }

  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error))

  // TODO: Only create context menu if selected text is "openable" in DevWallet.
  // chrome.contextMenus.create({
  //   id: 'open',
  //   title: 'Open in DevWallet',
  //   contexts: ['selection'],
  // })

  createContextMenuItem({
    id: 'open-wallet-tab',
    title: 'Open Wallet in a New Tab',
    type: 'normal',
    contexts: ['action'],
  })

  if (process.env.NODE_ENV === 'development') {
    createContextMenuItem({
      id: 'open-design-system',
      title: 'Open Design System',
      type: 'normal',
      contexts: ['action'],
    })
    createContextMenuItem({
      id: 'open-components',
      title: 'Open Component Playground',
      type: 'normal',
      contexts: ['action'],
    })
    createContextMenuItem({
      id: 'open-test-dapp',
      title: 'Open Test Dapp',
      type: 'normal',
      contexts: ['action'],
    })
  }

  chrome.contextMenus.onClicked.addListener(({ menuItemId }) => {
    if (menuItemId === 'open-wallet-tab') {
      chrome.tabs.create({
        url: `chrome-extension://${chrome.runtime.id}/src/index.html`,
      })
    } else if (menuItemId === 'open-design-system') {
      chrome.tabs.create({
        url: `chrome-extension://${chrome.runtime.id}/src/design-system/_playground/index.html`,
      })
    } else if (menuItemId === 'open-components') {
      chrome.tabs.create({
        url: `chrome-extension://${chrome.runtime.id}/src/components/_playground/index.html`,
      })
    } else if (menuItemId === 'open-test-dapp') {
      chrome.tabs.create({
        url: 'http://localhost:5199',
      })
    }
    // TODO: Match selected text.
    // } else if (menuItemId === 'open') {
    //   inpageMessenger.send('toggleWallet', {
    //     open: true,
    //     route: `/transaction/${selectionText}`,
    //   })
    // }
  })
}
