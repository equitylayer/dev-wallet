/**
 * The parts of `chrome.runtime.MessageSender` the guards read. Kept
 * structural so this module stays free of `chrome` and can be unit tested.
 */
export type MessageSenderLike = {
  id?: string
  url?: string
  tab?: { id?: number }
  frameId?: number
  documentId?: string
  origin?: string
}

/**
 * Whether a runtime message comes from one of our own extension pages (the
 * side panel, a popup, an extension iframe, or the background worker).
 *
 * Content scripts send with our extension id too, but their `url` is the
 * page they run in, so the id alone is not enough: a page can make the
 * content-script relay forward anything it posts.
 */
export function isExtensionPageSender(
  sender: MessageSenderLike,
  extensionId: string,
  extensionOrigin: string,
): boolean {
  if (sender.id !== extensionId) return false
  if (typeof sender.url !== 'string') return false
  // `new URL('chrome-extension://…').origin` is "null", so compare prefixes.
  // The trailing slash stops `chrome-extension://<id>x/` from matching.
  const prefix = extensionOrigin.endsWith('/')
    ? extensionOrigin
    : `${extensionOrigin}/`
  return sender.url.startsWith(prefix)
}

/**
 * Whether a message comes from a web page: anything that isn't one of our
 * extension pages, which is every frame's content script, top or not. A page
 * request is checked against its frame's own session.
 */
export function isPageSender(
  sender: MessageSenderLike,
  extensionId: string,
  extensionOrigin: string,
): boolean {
  return !isExtensionPageSender(sender, extensionId, extensionOrigin)
}

/**
 * Where a reply goes: into the document that asked (a page's frame, through
 * its content script), or on the runtime channel to an extension page.
 */
export type ReplyTarget =
  | { tabId: number; documentId: string }
  | { tabId: number; frameId: number }
  | { runtime: true }

/**
 * Where to answer a message: a content script's goes back to its tab, and in
 * it to its own document (or frame, without a document id), never to
 * whichever tab is active and never to the tab's other frames. An extension
 * page's goes on the runtime, even one open in a tab.
 */
export function replyTarget(
  sender: MessageSenderLike,
  extensionId: string,
  extensionOrigin: string,
): ReplyTarget {
  const tabId = sender.tab?.id
  if (
    typeof tabId !== 'number' ||
    isExtensionPageSender(sender, extensionId, extensionOrigin)
  )
    return { runtime: true }
  if (sender.documentId) return { tabId, documentId: sender.documentId }
  return { tabId, frameId: sender.frameId ?? 0 }
}

/** The connections a web page may use through the content-script relay. */
export const RELAYED_CONNECTIONS = ['background:inpage', 'wallet:inpage'] as const

export function isRelayedConnection(
  connection: unknown,
): connection is (typeof RELAYED_CONNECTIONS)[number] {
  return (RELAYED_CONNECTIONS as readonly unknown[]).includes(connection)
}

/** What a page's `openWallet` post becomes: its method, and nothing else. */
export type OpenWalletMessage = {
  type: 'openWallet'
  payload: { method: string }
}

/**
 * The page's `openWallet` post, rebuilt from its method alone, or `undefined`
 * when it isn't one. The page controls the whole object, so passing it on as
 * it is would let it put any `connection` or `topic` on the runtime channel,
 * past the relay's allowlist.
 */
export function openWalletMessage(data: unknown): OpenWalletMessage | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const { type, payload } = data as { type?: unknown; payload?: unknown }
  if (type !== 'openWallet') return undefined
  if (typeof payload !== 'object' || payload === null) return undefined
  const { method } = payload as { method?: unknown }
  if (typeof method !== 'string') return undefined
  return { type: 'openWallet', payload: { method } }
}
