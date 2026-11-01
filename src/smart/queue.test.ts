import { describe, expect, test } from 'bun:test'
import type { Address, Hash } from 'viem'

import {
  type BatchQueue,
  DEVWALLET_ORIGIN,
  type QueuedItem,
  cannotJoin,
  droppedItems,
  enqueue,
  flattenQueue,
  moveItem,
  openQueue,
  orphaned,
  queueAfterNetworkChange,
  queueRecords,
  removeItem,
  resolutions,
  waitingSites,
} from './queue'

const A = 'http://127.0.0.1:8545'
const B = 'http://127.0.0.1:8546'
const ACCOUNT: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const OTHER: Address = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
const X: Address = '0x00000000000000000000000000000000000a0a0a'
const Y: Address = '0x00000000000000000000000000000000000b0b0b'
const HASH: Hash = `0x${'ab'.repeat(32)}`

function item(
  requestId: number,
  overrides: Partial<QueuedItem> = {},
): QueuedItem {
  return {
    requestId,
    origin: 'a.test',
    method: 'eth_sendTransaction',
    calls: [{ to: X, value: '0x1' }],
    addedAt: requestId,
    ...overrides,
  }
}

function queue(items: QueuedItem[], overrides: Partial<BatchQueue> = {}) {
  return { rpcUrl: A, account: ACCOUNT, items, openedAt: 0, ...overrides }
}

const ids = (items: readonly QueuedItem[]) => items.map((i) => i.requestId)

describe('flattenQueue', () => {
  test("keeps the order, and each wallet_sendCalls group's calls together", () => {
    const items = [
      item(1, { calls: [{ to: X, value: '0x1' }] }),
      item(2, {
        method: 'wallet_sendCalls',
        bundleId: 'b',
        calls: [{ to: Y, data: '0x01' }, { to: Y, data: '0x02' }],
      }),
      item(3, { calls: [{ to: X, value: '0x3' }] }),
    ]
    expect(flattenQueue(items)).toEqual([
      { to: X, value: '0x1' },
      { to: Y, data: '0x01' },
      { to: Y, data: '0x02' },
      { to: X, value: '0x3' },
    ])
  })

  test('an empty queue has no calls', () => {
    expect(flattenQueue([])).toEqual([])
  })
})

describe('waitingSites', () => {
  test('counts distinct sites, not DevWallet', () => {
    const items = ['a.test', 'a.test', DEVWALLET_ORIGIN, 'b.test'].map(
      (origin, i) => item(i, { origin }),
    )
    expect(waitingSites(items)).toBe(2)
  })

  test('is 0 with only DevWallet sends', () => {
    expect(waitingSites([item(1, { origin: DEVWALLET_ORIGIN })])).toBe(0)
  })
})

describe('resolutions', () => {
  test('a transaction gets the hash, a batch its record id', () => {
    const items = [
      item(1),
      item(2, { method: 'wallet_sendCalls', bundleId: 'b2' }),
      item(3),
      item(4, { method: 'wallet_sendCalls', bundleId: 'b4' }),
    ]
    const result = resolutions(items, {
      transactionHash: HASH,
      recordIds: { 2: 'b2', 4: 'b4' },
    })
    expect([...result]).toEqual([
      [1, HASH],
      [2, { id: 'b2' }],
      [3, HASH],
      [4, { id: 'b4' }],
    ])
  })
})

describe('orphaned', () => {
  test('returns the items whose request is not live', () => {
    const items = [item(1), item(2), item(3)]
    expect(orphaned(items, new Set([2]))).toEqual([1, 3])
    expect(orphaned(items, new Set([1, 2, 3]))).toEqual([])
  })

  test('after a worker restart (nothing live), returns every id', () => {
    const items = [item(1), item(2), item(3)]
    expect(orphaned(items, new Set())).toEqual([1, 2, 3])
  })
})

describe('droppedItems', () => {
  test('returns the ids removed, not the ones moved or added', () => {
    const prev = [item(1), item(2), item(3)]
    const next = [item(3), item(1), item(4)]
    expect(droppedItems(prev, next)).toEqual([2])
  })

  test('clearing the queue drops everything', () => {
    expect(droppedItems([item(1), item(2)], [])).toEqual([1, 2])
  })
})

// Review Focus #5: the background's network-change rule.
describe('queueAfterNetworkChange', () => {
  test('another network closes the queue and rejects every request', () => {
    const open = queue([item(1), item(2)])
    expect(queueAfterNetworkChange(open, B)).toEqual({
      queue: null,
      reject: [1, 2],
    })
  })

  test("the queue's own network leaves it unchanged", () => {
    const open = queue([item(1), item(2)])
    const next = queueAfterNetworkChange(open, A)
    expect(next.queue).toBe(open)
    expect(next.reject).toEqual([])
  })

  test('with no queue there is nothing to reject', () => {
    expect(queueAfterNetworkChange(null, B)).toEqual({
      queue: null,
      reject: [],
    })
  })
})

describe('cannotJoin', () => {
  const candidate = {
    rpcUrl: A,
    account: ACCOUNT,
    mode: 'smart' as const,
    calls: [{ to: X }],
  }

  test('a smart account joins the open queue of its own, or opens one', () => {
    expect(cannotJoin(queue([item(1)]), candidate)).toBeNull()
    expect(
      cannotJoin(queue([]), {
        ...candidate,
        account: ACCOUNT.toLowerCase() as Address,
      }),
    ).toBeNull()
    expect(cannotJoin(null, candidate)).toBeNull()
  })

  test('a plain account never batches', () => {
    for (const mode of ['plain-upgradable', 'plain-never'] as const) {
      expect(cannotJoin(null, { ...candidate, mode })).toMatch(
        /Only smart accounts/,
      )
    }
  })

  test('a deployment never batches', () => {
    expect(
      cannotJoin(null, { ...candidate, calls: [{ to: X }, { data: '0x00' }] }),
    ).toMatch(/deployment/)
  })

  test("a queue open for another account or network isn't joined", () => {
    expect(cannotJoin(queue([], { account: OTHER }), candidate)).toMatch(
      OTHER,
    )
    expect(cannotJoin(queue([], { rpcUrl: B }), candidate)).toMatch(B)
  })
})

describe('queue edits', () => {
  test('openQueue opens an empty queue, and never replaces an open one', () => {
    const opened = openQueue(null, { rpcUrl: A, account: ACCOUNT }, 42)
    expect(opened).toEqual({
      rpcUrl: A,
      account: ACCOUNT,
      items: [],
      openedAt: 42,
    })
    const open = queue([item(1)])
    expect(openQueue(open, { rpcUrl: B, account: OTHER }, 43)).toBe(open)
  })

  test('enqueue appends, and needs an open queue', () => {
    expect(ids(enqueue(queue([item(1)]), item(2))?.items ?? [])).toEqual([1, 2])
    expect(enqueue(null, item(1))).toBeNull()
  })

  test('moveItem moves one item (a whole wallet_sendCalls group)', () => {
    const open = queue([item(1), item(2), item(3)])
    expect(ids(moveItem(open, 0, 2)?.items ?? [])).toEqual([2, 3, 1])
    expect(ids(moveItem(open, 2, 0)?.items ?? [])).toEqual([3, 1, 2])
    expect(ids(open.items)).toEqual([1, 2, 3])
  })

  test('moveItem out of range changes nothing', () => {
    const open = queue([item(1), item(2)])
    expect(moveItem(open, 0, 2)).toBe(open)
    expect(moveItem(open, -1, 0)).toBe(open)
    expect(moveItem(null, 0, 1)).toBeNull()
  })

  test('removeItem removes by request id', () => {
    const open = queue([item(1), item(2), item(3)])
    expect(ids(removeItem(open, 2)?.items ?? [])).toEqual([1, 3])
    expect(removeItem(open, 9)).toBe(open)
  })
})

describe('queueRecords', () => {
  test('one record per queued wallet_sendCalls, all sharing the result', () => {
    const items = [
      item(1),
      item(2, {
        method: 'wallet_sendCalls',
        bundleId: 'b2',
        calls: [{ to: Y, data: '0x01' }, { to: Y, data: '0x02' }],
      }),
      item(3, { method: 'wallet_sendCalls', bundleId: 'b3' }),
    ]
    const { records, recordIds } = queueRecords({
      rpcUrl: A,
      chainId: 31337,
      from: ACCOUNT,
      items,
      result: { path: 'userop', transactionHashes: [HASH], userOpHash: HASH },
      createdAt: 7,
    })
    expect(recordIds).toEqual({ 2: 'b2', 3: 'b3' })
    expect(records).toEqual([
      {
        id: 'b2',
        rpcUrl: A,
        chainId: 31337,
        from: ACCOUNT,
        calls: [{ to: Y, data: '0x01' }, { to: Y, data: '0x02' }],
        path: 'userop',
        transactionHashes: [HASH],
        userOpHash: HASH,
        createdAt: 7,
      },
      {
        id: 'b3',
        rpcUrl: A,
        chainId: 31337,
        from: ACCOUNT,
        calls: [{ to: X, value: '0x1' }],
        path: 'userop',
        transactionHashes: [HASH],
        userOpHash: HASH,
        createdAt: 7,
      },
    ])
  })

  test('a self-call record has no userOpHash', () => {
    const { records } = queueRecords({
      rpcUrl: A,
      chainId: 31337,
      from: ACCOUNT,
      items: [item(1, { method: 'wallet_sendCalls', bundleId: 'b' })],
      result: { path: 'self-call', transactionHashes: [HASH] },
      createdAt: 7,
    })
    expect(records[0]).not.toHaveProperty('userOpHash')
  })
})
