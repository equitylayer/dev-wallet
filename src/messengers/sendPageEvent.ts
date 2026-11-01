import { PAGE_EVENT, type PageEvent } from './page-events'

/**
 * Sends an event to the pages: to the content script of every frame in every
 * tab, which passes it on only when it is for its own frame's host
 * (`pageEventFor`). A page in any tab or frame hears its own events; none
 * hears another site's. Nobody waits for an answer, and a tab with no content
 * script (a `chrome://` page) is skipped.
 */
export async function sendPageEvent(event: PageEvent): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.tabs) return
  const message = {
    connection: 'wallet:inpage',
    topic: `> ${PAGE_EVENT}`,
    payload: event,
  }
  const tabs = await chrome.tabs.query({})
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id === undefined) return
      try {
        await chrome.tabs.sendMessage(tab.id, message)
      } catch {
        // No content script there to receive it.
      }
    }),
  )
}
