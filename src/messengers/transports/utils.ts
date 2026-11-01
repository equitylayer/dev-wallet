import { isPageEventTopic } from '../page-events'
import type { ReplyMessage, SendMessage } from './types'

export function isValidReply<TResponse>({
  id,
  topic,
  message,
}: {
  id?: number | string
  topic: string
  message: ReplyMessage<TResponse>
}) {
  if (message.topic !== `< ${topic}`) return false
  if (!message.payload) return false
  if (typeof id !== 'undefined' && message.id !== id) return false
  return true
}

export function isValidSend({
  topic,
  message,
  options,
}: {
  topic: string
  message: SendMessage<unknown>
  options?: { connection?: string }
}) {
  if (!message.topic) return false
  if (
    options?.connection &&
    message.connection &&
    message.connection !== options.connection
  )
    return false
  if (topic !== '*' && message.topic !== `> ${topic}`) return false
  if (topic === '*' && message.topic.startsWith('<')) return false
  // A page event is the provider's alone: no relay takes one, so none passes
  // it on or answers it (the content script posts it to the provider).
  if (topic === '*' && isPageEventTopic(message.topic.replace('> ', '')))
    return false
  return true
}

/**
 * Whether a message failed only because nobody was there to answer: no
 * content script in the tab, the frame gone, or a port closed with no
 * response (this transport never answers on the port, only with a message
 * of its own). Any other failure is real.
 */
export function isNoReceiverError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /Could not establish connection|Receiving end does not exist|message port closed before a response was received/.test(
    error.message,
  )
}
