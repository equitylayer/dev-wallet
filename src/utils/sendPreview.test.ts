import { describe, expect, test } from 'bun:test'
import type { Address } from 'viem'

import type { SendPreview } from '~/smart/preview'
import type { BatchQueue, QueuedItem } from '~/smart/queue'

import {
  ethAmount,
  locateCall,
  modeLabel,
  sendActions,
  signAnyway,
  tokenAmount,
  upgradesFirst,
} from './sendPreview'

const RPC = 'http://127.0.0.1:8545'
const OTHER_RPC = 'http://127.0.0.1:8546'
const ACCOUNT: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const OTHER: Address = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
const SPONSOR: Address = '0x90F79bf6EB2c4f870365E785982E1f101E93b906'
const X: Address = '0x00000000000000000000000000000000000a0a0a'

function preview(overrides: Partial<SendPreview> = {}): SendPreview {
  return {
    mode: 'smart',
    onchain: { kind: 'kernel' },
    atomicStatus: 'supported',
    path: 'userop',
    payer: SPONSOR,
    sponsored: true,
    estimatedCostWei: '46000000000000',
    simulation: { ok: true, gasUsed: '46000', balanceChanges: [] },
    ...overrides,
  }
}

const reverting = (overrides: Partial<SendPreview> = {}) =>
  preview({
    path: 'self-call',
    payer: ACCOUNT,
    sponsored: false,
    estimatedCostWei: null,
    simulation: {
      ok: false,
      failedIndex: 0,
      revertData: '0xdeadbeef',
      message: 'Call 1 reverted: custom error 0xdeadbeef',
    },
    ...overrides,
  })

function queue(overrides: Partial<BatchQueue> = {}): BatchQueue {
  return { rpcUrl: RPC, account: ACCOUNT, items: [], openedAt: 0, ...overrides }
}

const base = {
  method: 'eth_sendTransaction' as const,
  from: ACCOUNT,
  calls: [{ to: X, value: '0x1' as const }],
  rpcUrl: RPC,
  queue: null,
}

describe('sendActions', () => {
  test('a smart account with no batch open: Approve leads, Add to batch opens one', () => {
    expect(sendActions({ ...base, preview: preview() })).toEqual({
      addToBatch: true,
      primary: 'approve',
      signAnyway: false,
    })
  })

  test("with a batch open for the account, Add to batch leads", () => {
    expect(
      sendActions({ ...base, preview: preview(), queue: queue() }),
    ).toMatchObject({ addToBatch: true, primary: 'batch' })
  })

  test('no Add to batch where the background would refuse it', () => {
    const refused = [
      { preview: preview({ mode: 'plain-upgradable' }) },
      { preview: preview({ mode: 'plain-never' }) },
      { preview: preview(), calls: [{ data: '0x00' as const }] },
      { preview: preview(), queue: queue({ account: OTHER }) },
      { preview: preview(), queue: queue({ rpcUrl: OTHER_RPC }) },
      { preview: undefined },
    ]
    for (const args of refused) {
      expect(sendActions({ ...base, ...args })).toMatchObject({
        addToBatch: false,
        primary: 'approve',
      })
    }
  })

  test('a predicted revert makes Approve "Sign anyway"', () => {
    expect(sendActions({ ...base, preview: reverting() }).signAnyway).toBe(true)
  })
})

describe('signAnyway', () => {
  test('only for a predicted revert that the send can force', () => {
    expect(signAnyway('eth_sendTransaction', preview())).toBe(false)
    expect(signAnyway('eth_sendTransaction', undefined)).toBe(false)
    expect(signAnyway('wallet_sendCalls', reverting())).toBe(true)
    expect(
      signAnyway(
        'wallet_sendCalls',
        reverting({ mode: 'plain-upgradable', path: 'sequential' }),
      ),
    ).toBe(true)
  })

  test("not when the calls can't be sent at all", () => {
    expect(
      signAnyway(
        'wallet_sendCalls',
        reverting({
          path: null,
          payer: null,
          error: { code: -32602, message: 'There are no calls to execute' },
        }),
      ),
    ).toBe(false)
  })

  test("not for a plain account's eth_sendTransaction: the node sends it as it is", () => {
    expect(
      signAnyway(
        'eth_sendTransaction',
        reverting({ mode: 'plain-never', path: 'sequential' }),
      ),
    ).toBe(false)
  })
})

describe('upgradesFirst', () => {
  const plain = {
    mode: 'plain-upgradable' as const,
    onchain: { kind: 'eoa' as const },
    atomicStatus: 'ready' as const,
  }

  test('a plain-upgradable wallet_sendCalls previewed as Kernel', () => {
    expect(upgradesFirst('wallet_sendCalls', preview(plain))).toBe(true)
    expect(
      upgradesFirst(
        'wallet_sendCalls',
        reverting({ ...plain, path: 'self-call' }),
      ),
    ).toBe(true)
  })

  test('not an eth_sendTransaction, a smart account, or one the preview could not plan as Kernel', () => {
    expect(upgradesFirst('eth_sendTransaction', preview(plain))).toBe(false)
    expect(upgradesFirst('wallet_sendCalls', preview())).toBe(false)
    expect(
      upgradesFirst(
        'wallet_sendCalls',
        preview({ ...plain, path: 'sequential', sponsored: false }),
      ),
    ).toBe(false)
    expect(upgradesFirst('wallet_sendCalls', undefined)).toBe(false)
  })
})

describe('labels and amounts', () => {
  test('modeLabel', () => {
    expect(modeLabel('smart')).toBe('Smart')
    expect(modeLabel('plain-upgradable')).toBe('Plain (upgradable)')
    expect(modeLabel('plain-never')).toBe('Plain')
  })

  test('ethAmount: ETH like the balances, wei below a millionth', () => {
    expect(ethAmount(46_000_000_000_000n)).toEqual({
      amount: '0.000046',
      unit: 'ETH',
    })
    expect(ethAmount(-(10n ** 18n), { signed: true })).toEqual({
      amount: '−1.00',
      unit: 'ETH',
    })
    expect(ethAmount(3n, { signed: true })).toEqual({ amount: '+3', unit: 'wei' })
    expect(ethAmount(0n)).toEqual({ amount: '0', unit: 'ETH' })
  })

  test('tokenAmount keeps every digit, signed', () => {
    expect(tokenAmount(1_234_500_000n, 6)).toBe('+1,234.5')
    expect(tokenAmount(-1n, 18)).toBe('−0.000000000000000001')
    expect(tokenAmount(7n, 0)).toBe('+7')
  })
})

describe('locateCall', () => {
  const item = (requestId: number, calls: number): QueuedItem => ({
    requestId,
    origin: 'a.test',
    method: calls > 1 ? 'wallet_sendCalls' : 'eth_sendTransaction',
    calls: Array.from({ length: calls }, () => ({ to: X })),
    addedAt: 0,
  })
  const items = [item(1, 1), item(2, 3), item(3, 1)]

  test('maps a flat call index to its request and call', () => {
    expect(locateCall(items, 0)).toEqual({ itemIndex: 0, callIndex: 0 })
    expect(locateCall(items, 3)).toEqual({ itemIndex: 1, callIndex: 2 })
    expect(locateCall(items, 4)).toEqual({ itemIndex: 2, callIndex: 0 })
  })

  test('out of range, or unknown, is null', () => {
    expect(locateCall(items, 5)).toBeNull()
    expect(locateCall(items, null)).toBeNull()
  })
})
