import { type PageEvent, pageEventMessage } from './page-events'
import { isNoReceiverError } from './transports/utils'

/**
 * Sends an event to the pages: to the content script of every frame in every
 * tab, which passes it on only when it is for its own frame's host
 * (`pageEventFor`). A page in any tab or frame hears its own events; none
 * hears another site's. The message has no topic, so nothing answers it
 * (`pageEventMessage`); a tab with no content script (a `chrome://` page) is
 * skipped, and any other failure is warned about.
 */
export async function sendPageEvent(event: PageEvent): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.tabs) return
  const message = pageEventMessage(event)
  const tabs = await chrome.tabs.query({})
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id === undefined) return
      try {
        await chrome.tabs.sendMessage(tab.id, message)
      } catch (error) {
        // No content script there to receive it, or a real failure.
        if (!isNoReceiverError(error))
          console.warn('Failed to send a page event:', error)
      }
    }),
  )
}
