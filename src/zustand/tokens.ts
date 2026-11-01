import type { Address } from 'viem'
import { useSyncExternalStoreWithTracked } from '~/hooks/useSyncExternalStoreWithTracked'
import {
  type Token,
  addImportedToken,
  mergeDiscoveredTokens,
  migrateTokensState,
} from './tokens-logic'
import { createStore, getKey } from './utils'

export type { Token, TokenSource } from './tokens-logic'

export type TokensKey = {
  accountAddress: Address
  rpcUrl: string
}
export type SerializedTokensKey = string

export type TokensState = {
  tokens: Record<SerializedTokensKey, Token[]>
}

export type TokensActions = {
  addToken: (
    key: TokensKey,
    parameters: {
      tokenAddress: Address
    },
  ) => void
  hideToken: (
    key: TokensKey,
    parameters: {
      tokenAddress: Address
    },
  ) => void
  removeToken: (
    key: TokensKey,
    parameters: {
      tokenAddress: Address
    },
  ) => void
  syncTokens: (
    key: TokensKey,
    parameters: {
      /** The COMPLETE set of tokens currently discovered for the account. */
      tokenAddresses: Address[]
    },
  ) => void
}
export type TokensStore = TokensState & TokensActions

export function getTokensKey(key: TokensKey): SerializedTokensKey {
  return getKey(Object.values(key))
}

export const tokensStore = createStore<TokensStore>(
  (set, get) => ({
    tokens: {},
    addToken(key, args) {
      const { tokenAddress } = args
      const serializedKey = getTokensKey(key)

      set((state) => {
        const tokens = { ...state.tokens }
        tokens[serializedKey] = addImportedToken(
          state.tokens[serializedKey] || [],
          tokenAddress,
        )

        return {
          ...state,
          tokens,
        }
      })
    },
    hideToken(key, args) {
      const { tokenAddress } = args
      const serializedKey = getTokensKey(key)

      set((state) => {
        const tokens = { ...state.tokens }
        tokens[serializedKey] = (state.tokens[serializedKey] || []).map(
          (token) => {
            if (token.address === tokenAddress)
              return {
                ...token,
                visible: false,
              }
            return token
          },
        )
        return {
          ...state,
          tokens,
        }
      })
    },
    removeToken(key, args) {
      const { tokenAddress } = args
      const serializedKey = getTokensKey(key)

      set((state) => {
        const tokens = { ...state.tokens }
        tokens[serializedKey] = (state.tokens[serializedKey] || []).filter(
          (token) => token.address !== tokenAddress,
        )
        return {
          ...state,
          tokens,
        }
      })
    },
    syncTokens(key, args) {
      const { tokenAddresses } = args
      const serializedKey = getTokensKey(key)

      const current = get().tokens[serializedKey] || []
      const next = mergeDiscoveredTokens(current, tokenAddresses)
      // Runs every few seconds; when nothing changed, don't touch the store.
      if (next === current) return

      set((state) => ({
        ...state,
        tokens: { ...state.tokens, [serializedKey]: next },
      }))
    },
  }),
  {
    persist: {
      name: 'tokens',
      migrate: (persistedState, version) =>
        migrateTokensState(persistedState, version) as TokensStore,
      version: 2,
    },
  },
)

export const useTokensStore = () =>
  useSyncExternalStoreWithTracked(tokensStore.subscribe, tokensStore.getState)
