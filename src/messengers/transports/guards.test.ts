import { describe, expect, test } from 'bun:test'

import { isExtensionPageSender, isRelayedConnection } from './guards'

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
