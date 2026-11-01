// A site's host as DevWallet keys its sessions: storing a session and looking
// one up both go through `normalizeHost`, so `www.dapp.test` and `dapp.test`
// are one site. Pure, so it is unit-tested.

/** The host, lowercased, without a leading `www.`; the port stays. */
export function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '')
}

function hostOf(url: string | undefined): string {
  if (!url) return ''
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/**
 * The host of the frame that sent a message: its origin's, else (no origin
 * reported) its url's. A subframe is its own host, never its tab's. `''`, no
 * site, for an opaque origin (`'null'`: a sandboxed frame keeps its url but
 * is not that site) and when neither has one (a `file://` page).
 */
export function senderHost(sender: { origin?: string; url?: string }): string {
  if (sender.origin === 'null') return ''
  return normalizeHost(hostOf(sender.origin) || hostOf(sender.url))
}
