// Pure token-list logic. Kept free of chrome/zustand imports so `bun test`
// can load it; the tokens store in ./tokens.ts calls into these.
import type { Address } from 'viem'

export type TokenSource = 'discovered' | 'imported'

export type Token = {
  address: Address
  visible: boolean
  /**
   * `discovered`: found by scanning the chain for transfers; follows the
   * chain and is dropped when the scan no longer finds it.
   * `imported`: added by the user; stays until removed.
   */
  source: TokenSource
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/**
 * Reconcile a stored token list with a COMPLETE discovery scan of the chain.
 *
 * - New tokens are added (visible, discovered) at the front.
 * - Imported tokens and hidden tokens are always kept as they are.
 * - Visible discovered tokens the scan no longer finds are removed.
 * - Addresses compare case-insensitively; an imported token that is also
 *   discovered stays a single `imported` entry.
 *
 * Returns `existing` itself when nothing changed.
 */
export function mergeDiscoveredTokens(
  existing: Token[],
  discovered: Address[],
): Token[] {
  const discoveredSet = new Set(discovered.map((x) => x.toLowerCase()))
  const seen = new Set<string>()

  const kept: Token[] = []
  for (const token of existing) {
    const key = token.address.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (
      token.source === 'discovered' &&
      token.visible &&
      !discoveredSet.has(key)
    )
      continue
    kept.push(token)
  }

  // Prepended one by one, as before: the last new token ends up on top.
  let next = kept
  for (const address of discovered) {
    const key = address.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    next = [{ address, visible: true, source: 'discovered' }, ...next]
  }

  const unchanged =
    next.length === existing.length && next.every((x, i) => x === existing[i])
  return unchanged ? existing : next
}

/**
 * Add a user-imported token at the front. Replaces any entry for the same
 * address (so importing also unhides a hidden token).
 */
export function addImportedToken(existing: Token[], address: Address): Token[] {
  return [
    { address, visible: true, source: 'imported' },
    ...existing.filter((x) => !same(x.address, address)),
  ]
}

/**
 * Split tokens into those to list and those to collapse. A token collapses
 * only when it was discovered (never an imported one) and its balance is
 * known to be zero: a balance that is still loading keeps it listed.
 */
export function partitionEmptyTokens<T extends Token>(
  tokens: T[],
  balances: (bigint | undefined)[],
): { populated: T[]; empty: T[] } {
  const populated: T[] = []
  const empty: T[] = []
  tokens.forEach((token, i) => {
    if (token.source === 'discovered' && balances[i] === 0n) empty.push(token)
    else populated.push(token)
  })
  return { populated, empty }
}

///////////////////////////////////////////////////////////////////////////////////////
// Migrations

type SerializedTokensKey = string

export type TokensState_v0 = {
  tokens: Record<Address, Address[]>
}

export type TokensState_v1 = {
  tokens: Record<
    SerializedTokensKey,
    { address: Address; visible: boolean }[]
  >
}

export type TokensState_v2 = {
  tokens: Record<SerializedTokensKey, Token[]>
}

function v0_to_v1(state: TokensState_v0): TokensState_v1 {
  return {
    tokens: Object.fromEntries(
      Object.entries(state.tokens).map(([address, tokenAddresses]) => [
        address,
        tokenAddresses.map((tokenAddress) => ({
          address: tokenAddress,
          visible: false,
        })),
      ]),
    ),
  }
}

// We can't tell old imports from discovered tokens, so all become
// `discovered`. An old import that was never transferred may drop once on
// the next scan; re-importing brings it back.
function v1_to_v2(state: TokensState_v1): TokensState_v2 {
  return {
    ...state,
    tokens: Object.fromEntries(
      Object.entries(state.tokens).map(([key, tokens]) => [
        key,
        tokens.map((token) => ({
          ...token,
          source: 'discovered' as const,
        })),
      ]),
    ),
  }
}

export function migrateTokensState(
  persistedState: unknown,
  version: number,
): TokensState_v2 {
  let state = persistedState
  if (version < 1) state = v0_to_v1(state as TokensState_v0)
  if (version < 2) state = v1_to_v2(state as TokensState_v1)
  return state as TokensState_v2
}
