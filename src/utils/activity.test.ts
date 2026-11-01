import { describe, expect, test } from 'bun:test'
import {
  type Address,
  type Hash,
  type Hex,
  type Transaction,
  getAddress,
  pad,
  toHex,
} from 'viem'

import {
  DEVWALLET_PAYMASTER,
  DEVWALLET_SPONSOR,
  ENTRY_POINT_07,
} from '~/smart/constants'
import { DEV_ACCOUNTS } from '~/smart/testing/anvil'
import {
  type TestLog,
  handleOpsInput,
  testOp,
  userOperationEventLog,
} from '~/smart/testing/entrypoint'

import {
  type UserOpLog,
  activityFromBlock,
  activitySubject,
  knownName,
  userOpsByTransaction,
} from './activity'

const account = DEV_ACCOUNTS[1]
const other = DEV_ACCOUNTS[2]
const X = getAddress('0x00000000000000000000000000000000000a0a0a')
const Y = getAddress('0x00000000000000000000000000000000000b0b0b')

const hash = (n: number): Hash => pad(toHex(n), { size: 32 })

function tx({
  n,
  to = X,
  input = '0x',
  value = 0n,
  blockNumber = 1n,
}: {
  n: number
  to?: Address | null
  input?: Hex
  value?: bigint
  blockNumber?: bigint | null
}): Transaction {
  return {
    hash: hash(n),
    from: DEVWALLET_SPONSOR,
    to,
    input,
    value,
    blockNumber,
  } as unknown as Transaction
}

/** A receipt log as `getLogs` returns it for the activity query. */
function logOf(
  n: number | null,
  sender: Address,
  log: TestLog,
): UserOpLog {
  return {
    ...log,
    transactionHash: n === null ? null : hash(n),
    args: { sender },
  }
}

describe('knownName', () => {
  test('names the DevWallet sponsor, in any case', () => {
    expect(knownName(DEVWALLET_SPONSOR)).toBe('DevWallet sponsor')
    expect(
      knownName(DEVWALLET_SPONSOR.toLowerCase() as Address),
    ).toBe('DevWallet sponsor')
  })

  test('knows no other address', () => {
    expect(knownName(account)).toBeUndefined()
    expect(knownName(null)).toBeUndefined()
  })
})

describe('activityFromBlock', () => {
  test('is genesis once there are no more pages', () => {
    expect(
      activityFromBlock({
        transactions: [{ blockNumber: 40n }],
        hasNextPage: false,
      }),
    ).toBe(0n)
  })

  test('is the oldest loaded block, skipping pending transactions', () => {
    expect(
      activityFromBlock({
        transactions: [
          { blockNumber: null },
          { blockNumber: 12n },
          { blockNumber: 9n },
          { blockNumber: 10n },
        ],
        hasNextPage: true,
      }),
    ).toBe(9n)
  })

  test('is unknown with more pages but nothing mined loaded', () => {
    expect(
      activityFromBlock({
        transactions: [{ blockNumber: null }],
        hasNextPage: true,
      }),
    ).toBeUndefined()
  })
})

describe('userOpsByTransaction', () => {
  const bundle = tx({
    n: 1,
    to: ENTRY_POINT_07,
    input: handleOpsInput([
      testOp({
        sender: account,
        nonce: 0n,
        calls: [{ to: X, value: 1n }],
        paymaster: DEVWALLET_PAYMASTER,
      }),
      testOp({ sender: other, nonce: 0n, calls: [{ to: Y, value: 5n }] }),
      testOp({
        sender: account,
        nonce: 1n,
        calls: [{ to: Y, value: 2n, data: '0xdeadbeef' }],
        paymaster: DEVWALLET_PAYMASTER,
      }),
    ]),
  })
  const event = (sender: Address, nonce: bigint, success: boolean) =>
    userOperationEventLog({ sender, nonce, success, actualGasCost: 1n })

  test("merges the account's ops in one transaction, in order", () => {
    const found = userOpsByTransaction({
      account,
      transactions: [bundle],
      logs: [
        logOf(1, account, event(account, 1n, false)),
        logOf(1, account, event(account, 0n, true)),
      ],
    })
    expect([...found]).toEqual([
      [
        hash(1),
        {
          calls: [
            { to: X, value: 1n, data: '0x' },
            { to: Y, value: 2n, data: '0xdeadbeef' },
          ],
          success: false,
        },
      ],
    ])
  })

  test("ignores other senders' logs, logs without a transaction and transactions not loaded", () => {
    const found = userOpsByTransaction({
      account,
      transactions: [bundle],
      logs: [
        logOf(1, other, event(other, 0n, true)),
        logOf(null, account, event(account, 0n, true)),
        logOf(2, account, event(account, 5n, true)),
      ],
    })
    expect(found.size).toBe(0)
  })

  test('keeps a transaction it cannot decode, without ops', () => {
    // A bundler that reaches the EntryPoint through its own contract.
    const relayed = tx({ n: 3, to: X, input: bundle.input })
    const found = userOpsByTransaction({
      account,
      transactions: [relayed],
      logs: [logOf(3, account, event(account, 0n, true))],
    })
    expect(found.has(hash(3))).toBe(true)
    expect(found.get(hash(3))).toBeUndefined()
  })

  test('calls are null when one op is not a Kernel batch', () => {
    const mixed = tx({
      n: 4,
      to: ENTRY_POINT_07,
      input: handleOpsInput([
        testOp({ sender: account, nonce: 0n, calls: [{ to: X }] }),
        testOp({ sender: account, nonce: 1n, callData: '0x12345678' }),
      ]),
    })
    const found = userOpsByTransaction({
      account,
      transactions: [mixed],
      logs: [
        logOf(4, account, event(account, 0n, true)),
        logOf(4, account, event(account, 1n, true)),
      ],
    })
    expect(found.get(hash(4))).toEqual({ calls: null, success: true })
  })
})

describe('activitySubject', () => {
  const plain = tx({ n: 5, to: X, input: '0xabcdef01', value: 7n })

  test('is the transaction itself without user operations', () => {
    expect(
      activitySubject({ transaction: plain, status: 'mined' }),
    ).toEqual({ to: X, value: 7n, input: '0xabcdef01', count: 1 })
  })

  test('falls back to the transaction when the calls are unknown or empty', () => {
    const expected = {
      to: X,
      value: 7n,
      input: '0xabcdef01' as Hex,
      count: 1,
    }
    expect(
      activitySubject({
        transaction: plain,
        status: 'mined',
        userOps: { calls: null, success: true },
      }),
    ).toEqual(expected)
    expect(
      activitySubject({
        transaction: plain,
        status: 'mined',
        userOps: { calls: [], success: true },
      }),
    ).toEqual(expected)
  })

  test('a single call is described as that call', () => {
    expect(
      activitySubject({
        transaction: plain,
        status: 'mined',
        userOps: { calls: [{ to: Y }], success: true },
      }),
    ).toEqual({ to: Y, value: 0n, input: '0x', count: 1 })
  })

  test("a batch is its first call's target and input, the total value and the count", () => {
    expect(
      activitySubject({
        transaction: plain,
        status: 'mined',
        userOps: {
          calls: [
            { to: Y, value: 2n, data: '0x12345678' },
            { to: X },
            { to: X, value: 3n },
          ],
          success: true,
        },
      }),
    ).toEqual({ to: Y, value: 5n, input: '0x12345678', count: 3 })
  })
})
