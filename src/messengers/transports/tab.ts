import { type ReplyTarget, replyTarget } from './guards'
import type { ReplyMessage, SendMessage, Transport } from './types'
import { isNoReceiverError, isValidReply, isValidSend } from './utils'

/**
 * Creates a "tab transport" that can be used to communicate between
 * scripts where `chrome.tabs` & `chrome.runtime` is defined.
 *
 * `send` goes on the runtime: a content script's message to the extension.
 * Replies go back to whoever asked, a page's to the document it asked from.
 * The extension reaches pages unasked only through `sendPageEvent`, which
 * gives each page its own events.
 */
export const createTabTransport = <TConnection extends string>(
  connection: TConnection,
): Transport<TConnection> => ({
  available: Boolean(
    typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.tabs,
  ),
  connection,
  async send(topic, payload, { connection: connection_, id } = {}) {
    return new Promise((resolve, reject) => {
      const listener = (message: ReplyMessage<any>) => {
        if (!isValidReply({ id, message, topic })) return

        chrome.runtime.onMessage.removeListener(listener)

        const { response: response_, error } = message.payload
        if (error) reject(new Error(error.message))
        resolve(response_)
      }
      chrome.runtime.onMessage.addListener(listener)

      sendMessage(
        {
          connection: connection_ || connection,
          topic: `> ${topic}`,
          payload,
          id,
        },
        { runtime: true },
      )
    })
  },
  reply(topic, callback, options) {
    const listener = (
      message: SendMessage<any>,
      sender: chrome.runtime.MessageSender,
    ) => {
      if (!isValidSend({ message, options, topic })) return

      const repliedTopic = message.topic.replace('>', '<')
      // Back to the frame that asked, never to whichever tab is active.
      const target = replyTarget(
        sender,
        chrome.runtime.id,
        chrome.runtime.getURL(''),
      )

      callback(message.payload, {
        connection: message.connection,
        id: message.id,
        sender,
        topic: message.topic,
      })
        .then((response) =>
          sendMessage(
            {
              connection: message.connection,
              topic: repliedTopic,
              payload: { response },
              id: message.id,
            },
            target,
          ),
        )
        .catch((error_) => {
          const error: Record<string, unknown> = {}
          for (const key of Object.getOwnPropertyNames(error_)) {
            error[key] = (<Error>error_)[<keyof Error>key]
          }
          sendMessage(
            {
              connection: message.connection,
              topic: repliedTopic,
              payload: { error },
              id: message.id,
            },
            target,
          )
        })
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  },
})

function sendMessage<TPayload>(
  message: SendMessage<TPayload>,
  target: ReplyTarget,
) {
  try {
    const sent =
      'runtime' in target
        ? chrome.runtime.sendMessage(message)
        : chrome.tabs.sendMessage(
            target.tabId,
            message,
            'documentId' in target
              ? { documentId: target.documentId }
              : { frameId: target.frameId },
          )
    // The frame may be gone (navigated, closed): nobody is left to answer.
    Promise.resolve(sent).catch((error: unknown) => {
      if (!isNoReceiverError(error))
        console.warn('Failed to send message:', error)
    })
  } catch (error) {
    // Silently catch extension context invalidated errors
    // This happens when extension is reloaded/disabled
    if (
      error instanceof Error &&
      error.message.includes('Extension context invalidated')
    ) {
      return
    }
    console.error('Failed to send message:', error)
  }
}
