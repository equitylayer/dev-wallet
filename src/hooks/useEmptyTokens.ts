import type { Address } from 'viem'

import { type Token, partitionEmptyTokens } from '~/zustand/tokens-logic'

import { useErc20Balances } from './useErc20Balance'

/**
 * Split `tokens` into those to list and the empty discovered ones to
 * collapse. Balances come from the same query each `TokenRow` uses.
 */
export function useEmptyTokens({
  address,
  tokens,
}: {
  address: Address
  tokens: Token[]
}) {
  const balances = useErc20Balances({
    address,
    tokenAddresses: tokens.map((token) => token.address),
  })
  return partitionEmptyTokens(tokens, balances)
}
