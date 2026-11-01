/**
 * The parts of `chrome.runtime.MessageSender` the guards read. Kept
 * structural so this module stays free of `chrome` and can be unit tested.
 */
export type MessageSenderLike = {
  id?: string
  url?: string
  tab?: unknown
  frameId?: number
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

/** The connections a web page may use through the content-script relay. */
export const RELAYED_CONNECTIONS = ['background:inpage', 'wallet:inpage'] as const

export function isRelayedConnection(
  connection: unknown,
): connection is (typeof RELAYED_CONNECTIONS)[number] {
  return (RELAYED_CONNECTIONS as readonly unknown[]).includes(connection)
}
