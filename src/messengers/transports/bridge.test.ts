// The content script's relay against a fake `window`, `location` and
// `chrome`, installed for each test and removed after it. Page events reach
// the frame as `sendPageEvent` sends them.
import { afterEach, beforeEach, expect, test } from 'bun:test'
import type { Address } from 'viem'

import { accountsChangedEvent } from '../page-events'
import { sendPageEvent } from '../sendPageEvent'
import { setupBridgeTransportRelay } from './bridge'

const id = 'abcdefghijklmnopabcdefghijklmnop'
const extension = `chrome-extension://${id}/`
const accounts: Address[] = ['0x70997970C51812dc3A010C7d01b50e0d17dc79C8']

type Sender = chrome.runtime.MessageSender
type RuntimeListener = (message: unknown, sender: Sender) => void
type WindowListener = (event: { data: unknown; source: unknown }) => void

let runtimeListeners: RuntimeListener[] = []
let windowListeners: WindowListener[] = []
/** What the content script posted to the page. */
let posted: unknown[] = []
/** What the content script sent the extension. */
let toExtension: unknown[] = []
/** What the background sent the tabs. */
let toTabs: unknown[] = []

const fakeWindow = {
  addEventListener: (_: string, listener: WindowListener) =>
    void windowListeners.push(listener),
  removeEventListener: (_: string, listener: WindowListener) => {
    windowListeners = windowListeners.filter((l) => l !== listener)
  },
  postMessage: (data: unknown) => void posted.push(data),
}

type Globals = {
  window?: unknown
  location?: unknown
  origin?: unknown
  chrome?: unknown
}
const globals = globalThis as Globals

/** A frame at `href`; its own origin is `origin` (`'null'` when sandboxed). */
function frame(href: string, origin = new URL(href).origin) {
  globals.window = fakeWindow
  globals.location = { href, origin: new URL(href).origin }
  // `self.origin`: the document's own, opaque for a sandboxed frame.
  globals.origin = origin
  setupBridgeTransportRelay()
}

beforeEach(() => {
  runtimeListeners = []
  windowListeners = []
  posted = []
  toExtension = []
  toTabs = []
  globals.chrome = {
    runtime: {
      id,
      getURL: (path: string) => `${extension}${path}`,
      onMessage: {
        addListener: (listener: RuntimeListener) =>
          void runtimeListeners.push(listener),
        removeListener: (listener: RuntimeListener) => {
          runtimeListeners = runtimeListeners.filter((l) => l !== listener)
        },
      },
      sendMessage: async (message: unknown) => void toExtension.push(message),
    },
    tabs: {
      query: async () => [{ id: 1 }],
      sendMessage: async (_tab: number, message: unknown) =>
        void toTabs.push(message),
    },
  }
})
afterEach(() => {
  delete globals.window
  delete globals.location
  delete globals.origin
  delete globals.chrome
})

/** The background sends `event`; the frame's content script gets it. */
async function deliver(event: Parameters<typeof sendPageEvent>[0]) {
  await sendPageEvent(event)
  const background = { id, url: `${extension}service-worker-loader.js` }
  for (const message of toTabs.splice(0))
    for (const listener of [...runtimeListeners]) listener(message, background)
  await Bun.sleep(0)
}

/** The page's window delivers a post, as the browser does, to every listener. */
async function dispatch(data: unknown) {
  for (const listener of [...windowListeners])
    listener({ data, source: fakeWindow })
  await Bun.sleep(0)
}

const forDapp = () => accountsChangedEvent(accounts, [{ host: 'dapp.test' }])

test("a frame on the event's host posts it to its provider, and waits for nothing", async () => {
  frame('https://www.dapp.test/swap')
  const listening = windowListeners.length
  await deliver(forDapp())

  expect(posted).toEqual([
    {
      connection: 'wallet:inpage',
      topic: '> accountsChanged',
      payload: { accounts },
    },
  ])
  // A frame with no provider never answers: nothing is left waiting.
  expect(windowListeners).toHaveLength(listening)
})

test("the frame's own post, and its provider's answer, never reach the extension", async () => {
  frame('https://dapp.test/')
  await deliver(forDapp())
  // The browser hands the post to every listener in the frame, the relay's
  // own too; then the provider answers it.
  await dispatch(posted[0])
  await dispatch({
    connection: 'wallet:inpage',
    topic: '< accountsChanged',
    payload: { response: undefined },
  })

  expect(toExtension).toEqual([])
})

test('nothing in the frame answers its own event post', async () => {
  frame('https://dapp.test/')
  await deliver(forDapp())
  await dispatch(posted[0])

  // Only the post itself: no `< accountsChanged` from the relay.
  expect(posted).toEqual([
    {
      connection: 'wallet:inpage',
      topic: '> accountsChanged',
      payload: { accounts },
    },
  ])
})

test("another site's frame hears nothing", async () => {
  frame('https://evil.test/')
  await deliver(forDapp())
  expect(posted).toEqual([])
})

test("a sandboxed frame at the site's url is no site: it hears nothing", async () => {
  frame('https://dapp.test/', 'null')
  await deliver(forDapp())
  expect(posted).toEqual([])
})
