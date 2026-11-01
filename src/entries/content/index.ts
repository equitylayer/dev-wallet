import { getMessenger } from '~/messengers'
import { setupBridgeTransportRelay } from '~/messengers/transports/bridge'
import { openWalletMessage } from '~/messengers/transports/guards'

setupBridgeTransportRelay()

const backgroundMessenger = getMessenger('background:contentScript')
backgroundMessenger.send('ping', undefined)
setInterval(() => {
  backgroundMessenger.send('ping', undefined)
}, 5000)

// The provider asks to open the side panel before each request. Only this
// frame's own posts count, and only their method goes on.
window.addEventListener('message', (event) => {
  if (event.source !== window) return
  const message = openWalletMessage(event.data)
  if (message) chrome.runtime.sendMessage(message)
})
