// The extension transport against a fake `chrome.runtime`, which is installed
// for each test and removed after it.
import { afterEach, beforeEach, expect, test } from 'bun:test'

import { createExtensionTransport } from './extension'

const id = 'abcdefghijklmnopabcdefghijklmnop'
const origin = `chrome-extension://${id}/`

type Sender = chrome.runtime.MessageSender
type Listener = (message: unknown, sender: Sender) => void

let listeners: Listener[] = []
let outbox: unknown[] = []

beforeEach(() => {
  listeners = []
  outbox = []
  ;(globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      id,
      getURL: (path: string) => `${origin}${path}`,
      onMessage: {
        addListener: (listener: Listener) => listeners.push(listener),
        removeListener: (listener: Listener) => {
          listeners = listeners.filter((l) => l !== listener)
        },
      },
      sendMessage: (message: unknown) => void outbox.push(message),
    },
  }
})
afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome
})

function deliver(message: unknown, sender: Sender) {
  for (const listener of [...listeners]) listener(message, sender)
}

const sidePanel: Sender = { id, url: `${origin}src/index.html` }
const worker: Sender = { id, url: `${origin}service-worker-loader.js` }
// What the content-script relay looks like when it forwards a page's message.
const contentScript = {
  id,
  url: 'https://evil.test/',
  tab: { id: 1 },
  frameId: 0,
} as Sender

test("a page's spoofed approval, relayed by the content script, is ignored", async () => {
  const transport = createExtensionTransport('background:wallet')
  const received: unknown[] = []
  transport.reply('pendingRequest', async (payload) => {
    received.push(payload)
  })
  const approval = {
    connection: 'background:wallet',
    topic: '> pendingRequest',
    payload: { request: { id: 1 }, status: 'approved', force: true },
    id: 1,
  }

  deliver(approval, contentScript)
  await Bun.sleep(0)
  expect(received).toEqual([])
  expect(outbox).toEqual([])

  deliver(approval, sidePanel)
  await Bun.sleep(0)
  expect(received).toEqual([approval.payload])
})

test('a reply counts only from an extension page, like the background', async () => {
  const transport = createExtensionTransport('background:wallet')
  const answer = transport.send('ping', undefined, { id: 7 })
  const reply = (response: string) => ({
    connection: 'background:wallet',
    topic: '< ping',
    payload: { response },
    id: 7,
  })

  deliver(reply('forged'), contentScript)
  deliver(reply('pong'), worker)
  expect(await answer).toBe('pong')
})
