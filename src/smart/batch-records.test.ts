import { describe, expect, test } from 'bun:test'

import {
  type BatchRecord,
  type BatchRecordsState,
  clearRecords,
  getRecord,
  pruneRecords,
  putRecord,
  recordsForTransaction,
} from './batch-records'

const A = 'http://127.0.0.1:8545'
const B = 'http://127.0.0.1:8546'
const FROM = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const HASH_1 = `0x${'ab'.repeat(32)}` as const
const HASH_2 = `0x${'cd'.repeat(32)}` as const

function record(
  id: string,
  overrides: Partial<BatchRecord> = {},
): BatchRecord {
  return {
    id,
    rpcUrl: A,
    chainId: 31337,
    from: FROM,
    calls: [{ to: FROM }],
    path: 'self-call',
    transactionHashes: [HASH_1],
    createdAt: 0,
    ...overrides,
  }
}

const empty: BatchRecordsState = { records: {} }

function withRecords(...records: BatchRecord[]): BatchRecordsState {
  return records.reduce((state, r) => putRecord(state, r), empty)
}

function idsOf(state: BatchRecordsState, rpcUrl: string): string[] {
  return Object.keys(state.records[rpcUrl] ?? {}).sort()
}

describe('putRecord / getRecord', () => {
  test('stores a record under its rpcUrl and id, without mutating', () => {
    const state = putRecord(empty, record('one'))
    expect(getRecord(state, A, 'one')).toEqual(record('one'))
    expect(empty).toEqual({ records: {} })
  })

  test('is scoped to the network', () => {
    const state = withRecords(record('one'), record('one', { rpcUrl: B }))
    expect(getRecord(state, A, 'one')?.rpcUrl).toBe(A)
    expect(getRecord(state, B, 'one')?.rpcUrl).toBe(B)
    expect(getRecord(state, 'http://other', 'one')).toBeUndefined()
  })
})

describe('pruneRecords', () => {
  test('keeps the newest `keep` records by createdAt', () => {
    const state = withRecords(
      record('c', { createdAt: 30 }),
      record('a', { createdAt: 10 }),
      record('d', { createdAt: 40 }),
      record('b', { createdAt: 20 }),
    )
    expect(idsOf(pruneRecords(state, A, 2), A)).toEqual(['c', 'd'])
  })

  test('leaves other networks alone', () => {
    const state = withRecords(
      record('a', { createdAt: 10 }),
      record('b', { createdAt: 20 }),
      record('x', { rpcUrl: B, createdAt: 1 }),
      record('y', { rpcUrl: B, createdAt: 2 }),
    )
    const pruned = pruneRecords(state, A, 1)
    expect(idsOf(pruned, A)).toEqual(['b'])
    expect(idsOf(pruned, B)).toEqual(['x', 'y'])
  })

  test('does nothing under the limit, and defaults to 200', () => {
    const state = withRecords(record('a'), record('b'))
    expect(pruneRecords(state, A, 2)).toEqual(state)
    expect(pruneRecords(state, 'http://unknown', 1)).toEqual(state)

    const many = withRecords(
      ...Array.from({ length: 205 }, (_, i) =>
        record(`id-${i}`, { createdAt: i }),
      ),
    )
    const pruned = pruneRecords(many, A)
    expect(idsOf(pruned, A)).toHaveLength(200)
    expect(getRecord(pruned, A, 'id-4')).toBeUndefined()
    expect(getRecord(pruned, A, 'id-5')).toBeDefined()
  })
})

describe('clearRecords', () => {
  test('removes only that network', () => {
    const state = withRecords(
      record('a'),
      record('b', { rpcUrl: B }),
    )
    const cleared = clearRecords(state, A)
    expect(idsOf(cleared, A)).toEqual([])
    expect(idsOf(cleared, B)).toEqual(['b'])
    expect(idsOf(state, A)).toEqual(['a'])
  })
})

describe('recordsForTransaction', () => {
  test('matches a hash case-insensitively', () => {
    const state = withRecords(record('a', { transactionHashes: [HASH_1] }))
    const upper = `0x${'AB'.repeat(32)}` as const
    expect(recordsForTransaction(state, A, upper).map((r) => r.id)).toEqual([
      'a',
    ])
  })

  test('finds a hash in any position of a sequential batch', () => {
    const state = withRecords(
      record('seq', {
        path: 'sequential',
        transactionHashes: [HASH_1, HASH_2],
      }),
    )
    expect(recordsForTransaction(state, A, HASH_2)).toHaveLength(1)
  })

  test('returns every batch sharing the transaction, newest first', () => {
    const state = withRecords(
      record('old', { createdAt: 1 }),
      record('new', { createdAt: 2 }),
      record('other', { transactionHashes: [HASH_2], createdAt: 3 }),
    )
    expect(recordsForTransaction(state, A, HASH_1).map((r) => r.id)).toEqual([
      'new',
      'old',
    ])
  })

  test('only looks at the given network', () => {
    const state = withRecords(record('a', { rpcUrl: B }))
    expect(recordsForTransaction(state, A, HASH_1)).toEqual([])
    expect(recordsForTransaction(state, B, HASH_1)).toHaveLength(1)
  })
})
