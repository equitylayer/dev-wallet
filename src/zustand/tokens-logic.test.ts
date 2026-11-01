import { describe, expect, test } from 'bun:test'
import type { Address } from 'viem'

import {
  type Token,
  addImportedToken,
  mergeDiscoveredTokens,
  migrateTokensState,
} from './tokens-logic'

const A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address
const C = '0xcccccccccccccccccccccccccccccccccccccccc' as Address

const discovered = (address: Address, visible = true): Token => ({
  address,
  visible,
  source: 'discovered',
})
const imported = (address: Address, visible = true): Token => ({
  address,
  visible,
  source: 'imported',
})

describe('mergeDiscoveredTokens', () => {
  test('removes visible discovered tokens that are no longer found', () => {
    const result = mergeDiscoveredTokens(
      [discovered(A), discovered(B), discovered(C)],
      [B],
    )
    expect(result).toEqual([discovered(B)])
  })

  test('an empty discovery set clears visible discovered tokens', () => {
    expect(mergeDiscoveredTokens([discovered(A), discovered(B)], [])).toEqual(
      [],
    )
  })

  test('keeps hidden tokens even when they are no longer found', () => {
    const result = mergeDiscoveredTokens(
      [discovered(A, false), discovered(B)],
      [],
    )
    expect(result).toEqual([discovered(A, false)])
  })

  test('does not unhide a hidden token that is still found', () => {
    const result = mergeDiscoveredTokens([discovered(A, false)], [A])
    expect(result).toEqual([discovered(A, false)])
  })

  test('keeps imported tokens even when they are no longer found', () => {
    const result = mergeDiscoveredTokens([imported(A), discovered(B)], [])
    expect(result).toEqual([imported(A)])
  })

  test('adds newly discovered tokens as visible and discovered, first', () => {
    const result = mergeDiscoveredTokens([discovered(A)], [A, B])
    expect(result).toEqual([discovered(B), discovered(A)])
  })

  test('new tokens go ahead of imported and existing ones', () => {
    const result = mergeDiscoveredTokens([imported(A), discovered(B)], [B, C])
    expect(result.map((x) => x.address)).toEqual([C, A, B])
  })

  test('a batch of new tokens is prepended one by one (last on top)', () => {
    const result = mergeDiscoveredTokens([], [A, B, C])
    expect(result.map((x) => x.address)).toEqual([C, B, A])
  })

  test('compares addresses case-insensitively', () => {
    const checksummed = '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa' as Address
    const existing = [discovered(checksummed)]
    // Same token, other casing: stays, no duplicate.
    const result = mergeDiscoveredTokens(existing, [A])
    expect(result).toBe(existing)
    // And it is matched for pruning too.
    expect(mergeDiscoveredTokens(existing, [B])).toEqual([discovered(B)])
  })

  test('an imported token that is also discovered stays one imported entry', () => {
    const upper = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address
    const result = mergeDiscoveredTokens([imported(upper)], [A])
    expect(result).toEqual([imported(upper)])
  })

  test('collapses case-variant duplicates already in storage', () => {
    const upper = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address
    const result = mergeDiscoveredTokens(
      [discovered(upper), discovered(A)],
      [A],
    )
    expect(result).toEqual([discovered(upper)])
  })

  test('returns the same array when nothing changes', () => {
    const existing = [discovered(A), imported(B), discovered(C, false)]
    expect(mergeDiscoveredTokens(existing, [A])).toBe(existing)
    expect(mergeDiscoveredTokens(existing, [A, B, C])).toBe(existing)
  })

  test('does not mutate its input', () => {
    const existing = [discovered(A), discovered(B)]
    const snapshot = structuredClone(existing)
    mergeDiscoveredTokens(existing, [C])
    expect(existing).toEqual(snapshot)
  })
})

describe('addImportedToken', () => {
  test('adds an imported, visible token at the front', () => {
    expect(addImportedToken([discovered(A)], B)).toEqual([
      imported(B),
      discovered(A),
    ])
  })

  test('re-importing replaces the entry (case-insensitive), unhides it, and marks it imported', () => {
    const upper = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address
    const result = addImportedToken(
      [discovered(B), discovered(upper, false)],
      A,
    )
    expect(result).toEqual([imported(A), discovered(B)])
  })

  test('an imported token survives a sync that does not find it', () => {
    const list = addImportedToken([discovered(A)], B)
    expect(mergeDiscoveredTokens(list, [A])).toEqual(list)
  })
})

describe('migrateTokensState', () => {
  test('v1 -> v2: existing entries become discovered, nothing else changes', () => {
    const v1 = {
      tokens: {
        'acct-rpc': [
          { address: A, visible: true },
          { address: B, visible: false },
        ],
        'other-rpc': [{ address: C, visible: true }],
      },
    }
    expect(migrateTokensState(v1, 1)).toEqual({
      tokens: {
        'acct-rpc': [discovered(A), discovered(B, false)],
        'other-rpc': [discovered(C)],
      },
    })
  })

  test('v0 -> v2: keeps the v0 behaviour (hidden) and adds the source', () => {
    const v0 = { tokens: { 'acct-rpc': [A, B] } }
    expect(migrateTokensState(v0, 0)).toEqual({
      tokens: {
        'acct-rpc': [discovered(A, false), discovered(B, false)],
      },
    })
  })

  test('v2 passes through untouched', () => {
    const v2 = { tokens: { k: [imported(A), discovered(B)] } }
    expect(migrateTokensState(v2, 2)).toBe(v2)
  })

  test('v1 -> v2 handles an empty store', () => {
    expect(migrateTokensState({ tokens: {} }, 1)).toEqual({ tokens: {} })
  })
})
