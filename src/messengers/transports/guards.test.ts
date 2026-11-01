import { describe, expect, test } from 'bun:test'

import {
  isExtensionPageSender,
  isPageSender,
  isRelayedConnection,
  openWalletMessage,
} from './guards'

const id = 'abcdefghijklmnopabcdefghijklmnop'
const origin = `chrome-extension://${id}/`

describe('isExtensionPageSender', () => {
  test('the side panel is an extension page', () => {
    expect(
      isExtensionPageSender(
        { id, url: `${origin}src/index.html`, origin: origin.slice(0, -1) },
        id,
        origin,
      ),
    ).toBe(true)
  })

  test('the background service worker is one too', () => {
    // A worker's sender url is its script url (Chromium's
    // `SendOpenMessageChannel` passes `script_context->url()`).
    expect(
      isExtensionPageSender(
        { id, url: `${origin}service-worker-loader.js` },
        id,
        origin,
      ),
    ).toBe(true)
  })

  test('an extension page framed in a tab is one', () => {
    expect(
      isExtensionPageSender(
        {
          id,
          url: `${origin}src/index.html`,
          tab: { id: 7 },
          frameId: 3,
        },
        id,
        origin,
      ),
    ).toBe(true)
  })

  test('a content script is not, though it carries the extension id', () => {
    expect(
      isExtensionPageSender(
        { id, url: 'https://evil.test/', tab: { id: 7 }, frameId: 0 },
        id,
        origin,
      ),
    ).toBe(false)
  })

  test('another extension is not', () => {
    const other = 'ponmlkjihgfedcbaponmlkjihgfedcba'
    expect(
      isExtensionPageSender(
        { id: other, url: `chrome-extension://${other}/index.html` },
        id,
        origin,
      ),
    ).toBe(false)
    expect(
      isExtensionPageSender(
        { id: other, url: `${origin}src/index.html` },
        id,
        origin,
      ),
    ).toBe(false)
  })

  test('a sender without a url or id is not', () => {
    expect(isExtensionPageSender({ id }, id, origin)).toBe(false)
    expect(
      isExtensionPageSender({ url: `${origin}src/index.html` }, id, origin),
    ).toBe(false)
  })

  test('an id that merely starts like ours is not', () => {
    expect(
      isExtensionPageSender(
        { id, url: `chrome-extension://${id}x/index.html` },
        id,
        origin.slice(0, -1),
      ),
    ).toBe(false)
  })
})

describe('isRelayedConnection', () => {
  test('only the inpage connections are relayed from a page', () => {
    expect(isRelayedConnection('background:inpage')).toBe(true)
    expect(isRelayedConnection('wallet:inpage')).toBe(true)
  })

  test.each([
    'background:wallet',
    'background:contentScript',
    'wallet:contentScript',
    'contentScript:inpage',
    '',
    undefined,
    null,
    42,
  ])('%p is dropped', (connection) => {
    expect(isRelayedConnection(connection)).toBe(false)
  })
})

describe('openWalletMessage', () => {
  test('keeps the type and the method, and nothing else the page put in', () => {
    expect(
      openWalletMessage({
        type: 'openWallet',
        payload: { method: 'eth_requestAccounts', tabId: 3 },
        connection: 'background:wallet',
        topic: '> pendingRequest',
        id: 1,
      }),
    ).toEqual({ type: 'openWallet', payload: { method: 'eth_requestAccounts' } })
  })

  test.each([
    undefined,
    null,
    'openWallet',
    { type: 'openwallet', payload: { method: 'eth_sign' } },
    { type: 'openWallet' },
    { type: 'openWallet', payload: null },
    { type: 'openWallet', payload: 'eth_sign' },
    { type: 'openWallet', payload: {} },
    { type: 'openWallet', payload: { method: 42 } },
    { type: 'openWallet', payload: { method: { toString: 'eth_sign' } } },
  ])('%p is dropped', (data) => {
    expect(openWalletMessage(data)).toBeUndefined()
  })
})

describe('isPageSender', () => {
  test("a page's top frame, through the content script, is a page", () => {
    expect(
      isPageSender(
        { id, url: 'https://dapp.test/', tab: { id: 7 }, frameId: 0 },
        id,
        origin,
      ),
    ).toBe(true)
  })

  test('so is any of its subframes', () => {
    expect(
      isPageSender(
        {
          id,
          url: 'https://evil.test/frame',
          origin: 'https://evil.test',
          tab: { id: 7 },
          frameId: 4,
        },
        id,
        origin,
      ),
    ).toBe(true)
  })

  test('the side panel, the wallet in a tab and the worker are not', () => {
    expect(isPageSender({ id, url: `${origin}src/index.html` }, id, origin)).toBe(
      false,
    )
    expect(
      isPageSender(
        { id, url: `${origin}src/index.html`, tab: { id: 7 }, frameId: 0 },
        id,
        origin,
      ),
    ).toBe(false)
    expect(
      isPageSender({ id, url: `${origin}service-worker-loader.js` }, id, origin),
    ).toBe(false)
  })

  test('anything unidentified counts as a page', () => {
    expect(isPageSender({}, id, origin)).toBe(true)
    expect(isPageSender({ id }, id, origin)).toBe(true)
  })
})
