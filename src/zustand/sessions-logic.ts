// Pure session-list logic. Kept free of chrome/zustand imports so `bun test`
// can load it; the sessions store in ./sessions.ts calls into these.
import { normalizeHost } from '~/utils/host'

export type Session = { host: string; autoApprove?: boolean }

/**
 * Whether two hosts are one site: compared normalized (`normalizeHost`), so
 * `www.dapp.test` is `dapp.test`. No host (`''`: an opaque origin, a
 * `file://` page) is no site, and matches none, itself included.
 */
export function sameHost(a: string, b: string): boolean {
  const host = normalizeHost(a)
  return host !== '' && host === normalizeHost(b)
}

/** The site's session, under any spelling of its host. */
export function findSession(
  sessions: readonly Session[],
  host: string,
): Session | undefined {
  return sessions.find((session) => sameHost(session.host, host))
}

/**
 * `sessions` with the site connected, its host stored normalized. Returns
 * `sessions` itself when the site already has one, or has no host.
 */
export function withSession(sessions: Session[], session: Session): Session[] {
  const host = normalizeHost(session.host)
  if (host === '' || findSession(sessions, host)) return sessions
  return [...sessions, { ...session, host }]
}

/** `sessions` without any session of the site. */
export function withoutSession(sessions: Session[], host: string): Session[] {
  return sessions.filter((session) => !sameHost(session.host, host))
}
