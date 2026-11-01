import { batchQueueStore, syncStores } from '~/zustand'

import { getMessenger } from '../../messengers'
import { setupBatchQueue } from './batch-queue'
import { handleCommands } from './commands'
import { setupContextMenu } from './context-menu'
import { setupExtensionId } from './extension-id'
import { setupInpage } from './inpage'
import { dropOrphanedRequests, setupPendingRequests } from './pending-requests'
import { setupRpcHandler } from './rpc'
import { setupSmartHandlers } from './smart'
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
setupPendingRequests()
setupRpcHandler({ messenger: inpageMessenger })
setupRpcHandler({ messenger: walletMessenger })
setupSmartHandlers()
setupBatchQueue()
setupWalletSidebarHandler()
// The background is the batch queue's only writer: its copy is the truth.
syncStores({ except: [batchQueueStore] })
void dropOrphanedRequests()
