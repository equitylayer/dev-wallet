import { describe, expect, test } from 'bun:test'

import { isNoReceiverError } from './utils'

describe('isNoReceiverError', () => {
  test.each([
    // No content script in the tab, or the frame is gone.
    'Could not establish connection. Receiving end does not exist.',
    // Delivered, but no listener answered on the port: this transport never
    // does, it answers with a message of its own.
    'The message port closed before a response was received.',
  ])('%p: nobody there to answer', (message) => {
    expect(isNoReceiverError(new Error(message))).toBe(true)
  })

  test.each([
    new Error('Message length exceeded maximum allowed length.'),
    new Error('Extension context invalidated.'),
    new Error('boom'),
    'Could not establish connection. Receiving end does not exist.',
    undefined,
    null,
    { message: 'Receiving end does not exist.' },
  ])('%p is a real failure', (error) => {
    expect(isNoReceiverError(error)).toBe(false)
  })
})
