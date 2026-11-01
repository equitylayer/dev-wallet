import { isExtensionPageSender } from './guards'
import type {
  CallbackFunction,
  ReplyMessage,
  SendMessage,
  Transport,
} from './types'
import { isValidReply, isValidSend } from './utils'

/**
 * `chrome.runtime.onMessage` also delivers what content scripts send, and the
 * content-script relay forwards whatever a web page posts. Only our own
 * extension pages (and the background worker) may use this channel.
 */
function fromExtensionPage(sender: chrome.runtime.MessageSender) {
  return isExtensionPageSender(
    sender,
    chrome.runtime.id,
    chrome.runtime.getURL(''),
  )
}

/**
 * Creates an "extension transport" that can be used to communicate between
 * scripts where `chrome.runtime` is defined.
 */
export const createExtensionTransport = <TConnection extends string>(
  connection: TConnection,
): Transport<TConnection> => ({
  available: Boolean(typeof chrome !== 'undefined' && chrome.runtime?.id),
  connection,
  async send<TPayload, TResponse>(
    topic: string,
    payload: TPayload,
    {
      connection: connection_,
      id,
    }: { connection?: string; id?: number | string } = {},
  ) {
    return new Promise<TResponse>((resolve, reject) => {
      const listener = (
        message: ReplyMessage<TResponse>,
        sender: chrome.runtime.MessageSender,
      ) => {
        if (!fromExtensionPage(sender)) return
        if (!isValidReply<TResponse>({ id, message, topic })) return

        chrome.runtime.onMessage.removeListener(listener)

        const { response: response_, error } = message.payload
        if (error) reject(new Error(error.message))
        resolve(response_)
      }
      chrome.runtime.onMessage.addListener(listener)

      try {
        chrome.runtime.sendMessage({
          connection: connection_ || connection,
          topic: `> ${topic}`,
          payload,
          id,
        })
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('Extension context invalidated')
        ) {
          reject(new Error('Extension context invalidated'))
          return
        }
        reject(error)
      }
    })
  },
  reply<TPayload, TResponse>(
    topic: string,
    callback: CallbackFunction<TPayload, TResponse>,
  ) {
    const listener = (
      message: SendMessage<TPayload>,
      sender: chrome.runtime.MessageSender,
    ) => {
      if (!fromExtensionPage(sender)) return
      if (topic !== '*' && message.connection !== connection) return
      if (!isValidSend({ message, topic })) return

      const repliedTopic = message.topic.replace('>', '<')

      callback(message.payload, {
        connection: message.connection,
        id: message.id,
        sender,
        topic: message.topic,
      })
        .then((response) => {
          try {
            chrome.runtime.sendMessage({
              connection: message.connection,
              topic: repliedTopic,
              payload: { response },
              id: message.id,
            })
          } catch (error) {
            // Silently catch extension context invalidated errors
            if (
              error instanceof Error &&
              !error.message.includes('Extension context invalidated')
            ) {
              console.error('Failed to send message:', error)
            }
          }
        })
        .catch((error_) => {
          // Errors do not serialize properly over `chrome.runtime.sendMessage`, so
          // we are manually serializing it to an object.
          const error: Record<string, unknown> = {}
          for (const key of Object.getOwnPropertyNames(error_)) {
            error[key] = (<Error>error_)[<keyof Error>key]
          }
          try {
            chrome.runtime.sendMessage({
              connection: message.connection,
              topic: repliedTopic,
              payload: { error },
              id: message.id,
            })
          } catch (error) {
            // Silently catch extension context invalidated errors
            if (
              error instanceof Error &&
              !error.message.includes('Extension context invalidated')
            ) {
              console.error('Failed to send message:', error)
            }
          }
        })
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  },
})
