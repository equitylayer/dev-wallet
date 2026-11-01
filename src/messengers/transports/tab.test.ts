// The tab transport against a fake `chrome`, installed for each test and
// removed after it. Tab 1 is the active tab; pages ask from others.
import { afterEach, beforeEach, expect, test } from 'bun:test'

import { createTabTransport } from './tab'

const id = 'abcdefghijklmnopabcdefghijklmnop'
const origin = `chrome-extension://${id}/`

type Sender = chrome.runtime.MessageSender
type Listener = (message: unknown, sender: Sender) => void

let listeners: Listener[] = []
let runtimeOutbox: unknown[] = []
let tabsOutbox: [number, unknown, unknown][] = []

beforeEach(() => {
  listeners = []
  runtimeOutbox = []
  tabsOutbox = []
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
      sendMessage: async (message: unknown) => void runtimeOutbox.push(message),
    },
    tabs: {
      query: async () => [{ id: 1, url: 'https://active.test/' }],
      sendMessage: async (tabId: number, message: unknown, options: unknown) =>
        void tabsOutbox.push([tabId, message, options]),
    },
  }
})
afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome
})

function deliver(message: unknown, sender: Sender) {
  for (const listener of [...listeners]) listener(message, sender)
}

const request = (payload: unknown, messageId: number) => ({
  connection: 'background:inpage',
  topic: '> request',
  payload,
  id: messageId,
})

function answering() {
  const transport = createTabTransport('background:contentScript')
  transport.reply(
    'request',
    async (payload) => {
      if (payload === 'fail') throw new Error('no')
      return { answer: payload }
    },
    { connection: 'background:inpage' },
  )
}

test("a page's request is answered in the document that asked, not the active tab", async () => {
  answering()
  deliver(request('a', 7), {
    id,
    url: 'https://b.test/frame',
    origin: 'https://b.test',
    tab: { id: 2 } as chrome.tabs.Tab,
    frameId: 4,
    documentId: 'DOC-B',
  })
  await Bun.sleep(0)

  expect(tabsOutbox).toEqual([
    [
      2,
      {
        connection: 'background:inpage',
        topic: '< request',
        payload: { response: { answer: 'a' } },
        id: 7,
      },
      { documentId: 'DOC-B' },
    ],
  ])
  expect(runtimeOutbox).toEqual([])
})

test('two tabs asking with the same id each get their own answer', async () => {
  answering()
  const page = (tab: number) =>
    ({
      id,
      url: 'https://dapp.test/',
      tab: { id: tab } as chrome.tabs.Tab,
      frameId: 0,
    }) as Sender
  deliver(request('first', 7), page(2))
  deliver(request('second', 7), page(3))
  await Bun.sleep(0)

  expect(
    tabsOutbox.map(([tab, message, options]) => [
      tab,
      (message as { payload: unknown }).payload,
      options,
    ]),
  ).toEqual([
    [2, { response: { answer: 'first' } }, { frameId: 0 }],
    [3, { response: { answer: 'second' } }, { frameId: 0 }],
  ])
})

test('an error goes back to the frame that asked too', async () => {
  answering()
  deliver(request('fail', 8), {
    id,
    url: 'https://b.test/',
    tab: { id: 2 } as chrome.tabs.Tab,
    frameId: 0,
  })
  await Bun.sleep(0)

  expect(tabsOutbox).toHaveLength(1)
  const [tab, message, options] = tabsOutbox[0]!
  expect(tab).toBe(2)
  expect(options).toEqual({ frameId: 0 })
  expect(message).toMatchObject({
    topic: '< request',
    id: 8,
    payload: { error: { message: 'no' } },
  })
})

test('an extension page is answered on the runtime', async () => {
  answering()
  deliver(request('panel', 9), { id, url: `${origin}src/index.html` })
  await Bun.sleep(0)

  expect(tabsOutbox).toEqual([])
  expect(runtimeOutbox).toEqual([
    {
      connection: 'background:inpage',
      topic: '< request',
      payload: { response: { answer: 'panel' } },
      id: 9,
    },
  ])
})

test('send goes on the runtime, never to the active tab', async () => {
  const transport = createTabTransport('background:contentScript')
  void transport.send('ping', undefined, { id: 1 })
  await Bun.sleep(0)

  expect(tabsOutbox).toEqual([])
  expect(runtimeOutbox).toEqual([
    {
      connection: 'background:contentScript',
      topic: '> ping',
      payload: undefined,
      id: 1,
    },
  ])
})
