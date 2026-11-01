// `sendPageEvent` against a fake `chrome`, installed for each test and
// removed after it.
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'

import { disconnectEvent } from './page-events'
import { sendPageEvent } from './sendPageEvent'
import { isValidSend } from './transports/utils'

const NO_RECEIVER =
  'Could not establish connection. Receiving end does not exist.'

let sent: [number, unknown][] = []
/** How each tab's delivery fails, by tab id. */
let failures: Record<number, Error> = {}

beforeEach(() => {
  sent = []
  failures = {}
  ;(globalThis as { chrome?: unknown }).chrome = {
    tabs: {
      query: async () => [{ id: 1 }, { id: 2 }, {}, { id: 3 }],
      sendMessage: async (tab: number, message: unknown) => {
        if (failures[tab]) throw failures[tab]
        sent.push([tab, message])
      },
    },
  }
})
afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome
})

test('every tab gets the event, as a message no transport answers', async () => {
  const event = disconnectEvent('dapp.test')
  await sendPageEvent(event)

  expect(sent.map(([tab]) => tab)).toEqual([1, 2, 3])
  for (const [, message] of sent) {
    expect(message).toEqual({ type: 'pageEvent', event })
    // No topic: no transport's `reply` takes it for a request.
    expect(
      isValidSend({ message: message as never, topic: '*' }),
    ).toBe(false)
  }
})

test('a tab with no content script is skipped quietly; any other failure is warned', async () => {
  const warn = spyOn(console, 'warn').mockImplementation(() => {})
  try {
    failures = { 1: new Error(NO_RECEIVER), 2: new Error('boom') }
    await sendPageEvent(disconnectEvent('dapp.test'))

    expect(sent.map(([tab]) => tab)).toEqual([3])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0])).toContain('boom')
  } finally {
    warn.mockRestore()
  }
})
