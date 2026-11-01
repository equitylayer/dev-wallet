// The EIP-1193 events DevWallet sends pages (`accountsChanged`,
// `chainChanged`, `connect`, `disconnect`), and which page gets which. An
// event goes to every frame's content script, with the hosts it is for; each
// content script passes on only its own host's, as the topic and payload the
// provider listens for. So a page hears only its own events, and never which
// other sites are connected. Pure, so it is unit-tested; `sendPageEvent`
// delivers.
import type { Address } from 'viem'

import { normalizeHost } from '~/utils/host'

/** The type of the message that carries a page event to content scripts. */
export const PAGE_EVENT = 'pageEvent'

/** What a page's provider receives, by topic. */
export type PagePayloads = {
  accountsChanged: { accounts: Address[] }
  chainChanged: { chainId: string }
  connect: { chainId: string }
  disconnect: undefined
}
type Topic = keyof PagePayloads

/** An event for the pages on `hosts`, normalized. */
export type PageEvent = {
  [T in Topic]: { topic: T; payload: PagePayloads[T]; hosts: string[] }
}[Topic]

/** What one page gets: the provider's topic and payload, and nothing else. */
export type PageMessage = {
  [T in Topic]: { topic: T; payload: PagePayloads[T] }
}[Topic]

const TOPICS: readonly string[] = [
  'accountsChanged',
  'chainChanged',
  'connect',
  'disconnect',
] satisfies Topic[]

const hostsOf = (sessions: readonly { host: string }[]) =>
  sessions.map((session) => normalizeHost(session.host))

/** The accounts, for every connected site. */
export function accountsChangedEvent(
  accounts: Address[],
  sessions: readonly { host: string }[],
): PageEvent {
  return {
    topic: 'accountsChanged',
    payload: { accounts },
    hosts: hostsOf(sessions),
  }
}

/** The chain id, for every connected site. */
export function chainChangedEvent(
  chainId: string,
  sessions: readonly { host: string }[],
): PageEvent {
  return { topic: 'chainChanged', payload: { chainId }, hosts: hostsOf(sessions) }
}

/** For the site just connected. */
export function connectEvent(host: string, chainId: string): PageEvent {
  return {
    topic: 'connect',
    payload: { chainId },
    hosts: [normalizeHost(host)],
  }
}

/** For the site just disconnected. */
export function disconnectEvent(host: string): PageEvent {
  return {
    topic: 'disconnect',
    payload: undefined,
    hosts: [normalizeHost(host)],
  }
}

/**
 * What the page on `host` gets of an event: its topic and payload when the
 * event is for that host, else `undefined`.
 */
export function pageEventFor(
  event: unknown,
  host: string,
): PageMessage | undefined {
  if (typeof event !== 'object' || event === null) return undefined
  const { topic, payload, hosts } = event as Partial<PageEvent>
  if (typeof topic !== 'string' || !TOPICS.includes(topic)) return undefined
  // No host (an opaque origin) is no site: it hears no site's events.
  const own = normalizeHost(host)
  if (own === '' || !Array.isArray(hosts) || !hosts.includes(own))
    return undefined
  return { topic, payload } as PageMessage
}

/**
 * What `sendPageEvent` sends every frame's content script. It has no
 * `topic`, so no transport takes it for a request: nothing answers it.
 */
export type PageEventMessage = { type: typeof PAGE_EVENT; event: PageEvent }

export function pageEventMessage(event: PageEvent): PageEventMessage {
  return { type: PAGE_EVENT, event }
}

/** The event a `PageEventMessage` carries; `undefined` for any other. */
export function eventIn(message: unknown): unknown {
  if (typeof message !== 'object' || message === null) return undefined
  const { type, event } = message as Partial<PageEventMessage>
  return type === PAGE_EVENT ? event : undefined
}

/**
 * The window post that hands a page its event: a request on the provider's
 * `wallet:inpage` messenger, for the event's topic. Nobody waits for the
 * answer.
 */
export function providerPost(message: PageMessage) {
  return {
    connection: 'wallet:inpage',
    topic: `> ${message.topic}`,
    payload: message.payload,
  }
}

/** Whether `topic` is a page event's: the extension's to say, never a page's to ask. */
export function isPageEventTopic(topic: string): boolean {
  return TOPICS.includes(topic)
}
