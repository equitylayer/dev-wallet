import { describe, expect, test } from 'bun:test'

import {
  type Session,
  findSession,
  sameHost,
  withSession,
  withoutSession,
} from './sessions-logic'

describe('sameHost', () => {
  test.each([
    ['dapp.test', 'dapp.test'],
    ['www.dapp.test', 'dapp.test'],
    ['DApp.Test', 'www.dapp.test'],
    ['localhost:5173', 'www.localhost:5173'],
  ])('%p and %p are one site', (a, b) => {
    expect(sameHost(a, b)).toBe(true)
  })

  test.each([
    ['dapp.test', 'evil.test'],
    ['dapp.test', 'app.dapp.test'],
    ['localhost:5173', 'localhost:3000'],
    // No host (an opaque origin, a `file://` page) is no site.
    ['', ''],
    ['', 'dapp.test'],
    ['www.', ''],
  ])('%p and %p are not', (a, b) => {
    expect(sameHost(a, b)).toBe(false)
  })
})

describe('withSession', () => {
  test('stores the host normalized', () => {
    expect(withSession([], { host: 'WWW.DApp.test' })).toEqual([
      { host: 'dapp.test' },
    ])
  })

  test('a site already connected keeps its session: the same list', () => {
    const sessions: Session[] = [{ host: 'dapp.test', autoApprove: true }]
    expect(withSession(sessions, { host: 'www.dapp.test' })).toBe(sessions)
  })

  test('appends a new site', () => {
    expect(withSession([{ host: 'a.test' }], { host: 'b.test' })).toEqual([
      { host: 'a.test' },
      { host: 'b.test' },
    ])
  })

  test('no host is never connected: the same list', () => {
    const sessions: Session[] = []
    expect(withSession(sessions, { host: '' })).toBe(sessions)
    expect(withSession(sessions, { host: 'www.' })).toBe(sessions)
  })
})

describe('findSession', () => {
  const sessions: Session[] = [{ host: 'dapp.test' }, { host: 'localhost:5173' }]

  test('finds the site under any spelling of its host', () => {
    expect(findSession(sessions, 'www.DApp.test')).toEqual({ host: 'dapp.test' })
    expect(findSession(sessions, 'localhost:5173')).toEqual({
      host: 'localhost:5173',
    })
  })

  test('none for another site, or another port', () => {
    expect(findSession(sessions, 'evil.test')).toBeUndefined()
    expect(findSession(sessions, 'localhost:3000')).toBeUndefined()
  })

  test("no host finds none, even a stored '' session", () => {
    expect(findSession([{ host: '' }], '')).toBeUndefined()
  })
})

describe('withoutSession', () => {
  test('removes the site under any spelling, and every entry of it', () => {
    // An entry from before hosts were normalized, and one from after.
    const sessions: Session[] = [
      { host: 'www.dapp.test' },
      { host: 'other.test' },
      { host: 'dapp.test' },
    ]
    expect(withoutSession(sessions, 'DApp.test')).toEqual([
      { host: 'other.test' },
    ])
  })

  test('another site stays', () => {
    const sessions: Session[] = [{ host: 'dapp.test' }]
    expect(withoutSession(sessions, 'evil.test')).toEqual(sessions)
  })
})
