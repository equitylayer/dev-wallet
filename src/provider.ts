import { EventEmitter } from 'eventemitter3'
import type { EIP1193Provider } from 'viem'

import { ProviderDisconnectedError, toProviderError } from '~/errors'
import type { Messenger } from '~/messengers'
import type { RpcRequest } from '~/types/rpc'

const providerCache = new Map<string, EIP1193Provider>()
export function getProvider({
  eventMessenger: eventMessenger_,
  requestMessenger,
  rpcUrl,
}: {
  eventMessenger: Messenger | Messenger[]
  requestMessenger: Messenger
  rpcUrl?: string
}): EIP1193Provider {
  const eventMessenger = Array.isArray(eventMessenger_)
    ? eventMessenger_
    : [eventMessenger_]

  const cacheKey = `${requestMessenger.connection}.${eventMessenger
    .map((m) => m.connection)
    .join('.')}.${rpcUrl}`
  const cachedProvider = rpcUrl ? providerCache.get(cacheKey) : undefined
  if (cachedProvider) return cachedProvider

  const emitter = new EventEmitter()

  // Workaround for id conflicts between inpage & wallet.
  let _id = Math.floor(Math.random() * 10000)

  // A page's content script passes on only the events for its own host
  // (`pageEventFor`), so whatever arrives here is this page's.
  function listen(messenger: Messenger) {
    messenger.reply('accountsChanged', async ({ accounts }) => {
      emitter.emit('accountsChanged', accounts)
    })

    messenger.reply('chainChanged', async ({ chainId }) => {
      emitter.emit('chainChanged', chainId)
    })

    messenger.reply('connect', async ({ chainId }) => {
      emitter.emit('connect', { chainId })
    })

    messenger.reply('disconnect', async () => {
      emitter.emit(
        'disconnect',
        new ProviderDisconnectedError(new Error('Disconnected.')),
      )
    })
  }
  eventMessenger.forEach(listen)

  const provider: EIP1193Provider = {
    on: emitter.on.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    async request({ method, params }) {
      const id = _id++

      window.postMessage({
        type: 'openWallet',
        payload: { method },
      })

      const { result, error, ...response } = await requestMessenger.send(
        'request',
        {
          request: {
            method,
            params,
            id,
          } as RpcRequest,
          rpcUrl,
        },
        { id },
      )
      if (response.id !== id) return
      if (error) throw toProviderError(error)
      return result
    },
  }
  if (rpcUrl) providerCache.set(cacheKey, provider)
  return provider
}
