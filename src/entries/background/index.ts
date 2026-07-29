import { syncStores } from '~/zustand'

import { getMessenger } from '../../messengers'
import { handleCommands } from './commands'
import { setupContextMenu } from './context-menu'
import { setupExtensionId } from './extension-id'
import { setupInpage } from './inpage'
import { dropOrphanedRequests } from './pending-requests'
import { setupRpcHandler } from './rpc'
import { setupWalletSidebarHandler } from './wallet-sidebar'

const contentMessenger = getMessenger('background:contentScript')
const inpageMessenger = getMessenger('background:inpage')
const walletMessenger = getMessenger('background:wallet')

contentMessenger.reply('ping', async () => 'pong')
// Lets the wallet start a stopped worker, so it can clear out requests that no
// longer have a handler waiting on them.
walletMessenger.reply('ping', async () => 'pong')

handleCommands()
void setupContextMenu()
setupExtensionId()
setupInpage()
setupRpcHandler({ messenger: inpageMessenger })
setupRpcHandler({ messenger: walletMessenger })
setupWalletSidebarHandler()
syncStores()
void dropOrphanedRequests()
