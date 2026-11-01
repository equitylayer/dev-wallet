import { describe, expect, test } from 'bun:test'

import { normalizeHost, senderHost } from './host'

describe('normalizeHost', () => {
  test.each([
    ['www.example.com', 'example.com'],
    ['example.com', 'example.com'],
    ['WWW.Example.COM', 'example.com'],
    ['www.localhost:5173', 'localhost:5173'],
    ['localhost:5173', 'localhost:5173'],
    // Only a leading `www.` goes.
    ['awww.com', 'awww.com'],
    ['app.www.example.com', 'app.www.example.com'],
    ['www2.example.com', 'www2.example.com'],
    ['', ''],
  ])('%p is %p', (host, normalized) => {
    expect(normalizeHost(host)).toBe(normalized)
  })

  test('storing and looking up meet', () => {
    expect(normalizeHost('www.dapp.test')).toBe(normalizeHost('dapp.test'))
  })
})

describe('senderHost', () => {
  test("the frame's origin comes first", () => {
    expect(
      senderHost({
        origin: 'https://www.dapp.test',
        url: 'https://www.dapp.test/swap?x=1',
      }),
    ).toBe('dapp.test')
  })

  test("a subframe is its own host, not its tab's", () => {
    expect(
      senderHost({
        origin: 'https://evil.test',
        url: 'https://evil.test/frame.html',
        tab: { id: 1, url: 'https://dapp.test/' },
      } as Parameters<typeof senderHost>[0]),
    ).toBe('evil.test')
  })

  test('the origin wins over a url that disagrees', () => {
    expect(
      senderHost({ origin: 'https://evil.test', url: 'https://dapp.test/' }),
    ).toBe('evil.test')
  })

  test('an opaque origin falls back to the url', () => {
    expect(
      senderHost({ origin: 'null', url: 'https://sandboxed.test/a' }),
    ).toBe('sandboxed.test')
  })

  test('no origin falls back to the url', () => {
    expect(senderHost({ url: 'http://localhost:3000/' })).toBe(
      'localhost:3000',
    )
  })

  test('the port is part of the host', () => {
    expect(senderHost({ origin: 'http://localhost:3000' })).toBe(
      'localhost:3000',
    )
  })

  test('a file:// page, or nothing to go on, has no host', () => {
    expect(senderHost({ origin: 'null', url: 'file:///tmp/a.html' })).toBe('')
    expect(senderHost({})).toBe('')
    expect(senderHost({ origin: 'not a url', url: 'nor this' })).toBe('')
  })
})
