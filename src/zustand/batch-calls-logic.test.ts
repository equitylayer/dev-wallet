import { describe, expect, test } from 'bun:test'

import { migrateBatchCallsState } from './batch-calls-logic'

describe('migrateBatchCallsState', () => {
  test('v0 -> v1: the batches kept by id alone are dropped', () => {
    const v0 = {
      batches: {
        '0xabc': { status: 200, transactionHashes: ['0x01'] },
      },
    }
    expect(migrateBatchCallsState(v0)).toEqual({ records: {} })
  })

  test('nothing stored is no records', () => {
    expect(migrateBatchCallsState(undefined)).toEqual({ records: {} })
  })
})
