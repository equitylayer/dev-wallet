import { describe, expect, test } from 'bun:test'
import type { Address } from 'viem'

import type { SendPreview } from '~/smart/preview'
import type { BatchQueue, QueuedItem } from '~/smart/queue'

import {
  estimatedCost,
  ethAmount,
  gasShortfall,
  locateCall,
  modeName,
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
      addToBatch: 'offer',
      batchNote: null,
      primary: 'approve',
      signAnyway: false,
    })
  })

  test('with a batch open for the account, Add to batch leads', () => {
    expect(
      sendActions({ ...base, preview: preview(), queue: queue() }),
    ).toMatchObject({ addToBatch: 'offer', primary: 'batch' })
  })

  test('no Add to batch where the background would refuse it', () => {
    const refused = [
      { preview: preview({ mode: 'plain-upgradable' }) },
      { preview: preview({ mode: 'plain-never' }) },
      { preview: preview(), calls: [{ data: '0x00' as const }] },
    ]
    for (const args of refused) {
      expect(sendActions({ ...base, ...args })).toMatchObject({
        addToBatch: 'hidden',
        batchNote: null,
        primary: 'approve',
      })
    }
  })

  test('a batch open for another account or network says why Add to batch is missing', () => {
    expect(
      sendActions({ ...base, preview: preview(), queue: queue({ account: OTHER }) }),
    ).toEqual({
      addToBatch: 'hidden',
      batchNote: `A batch is already open for ${OTHER}.`,
      primary: 'approve',
      signAnyway: false,
    })
    // Known before the preview, so it never shows and goes.
    expect(
      sendActions({ ...base, preview: undefined, queue: queue({ rpcUrl: OTHER_RPC }) }),
    ).toMatchObject({
      addToBatch: 'hidden',
      batchNote: `A batch is already open on another network (${OTHER_RPC}).`,
    })
    // A plain account couldn't batch anyway: no note.
    expect(
      sendActions({
        ...base,
        preview: preview({ mode: 'plain-never' }),
        queue: queue({ account: OTHER }),
      }).batchNote,
    ).toBeNull()
  })

  test('while the preview loads, Add to batch waits in its place', () => {
    expect(sendActions({ ...base, preview: undefined, loading: true })).toEqual({
      addToBatch: 'wait',
      batchNote: null,
      primary: 'approve',
      signAnyway: false,
    })
    expect(
      sendActions({
        ...base,
        mode: 'smart',
        preview: undefined,
        loading: true,
        queue: queue(),
      }),
    ).toMatchObject({ addToBatch: 'wait', primary: 'batch' })
    // A plain account's is known before the preview: never shown.
    expect(
      sendActions({ ...base, mode: 'plain-never', preview: undefined, loading: true })
        .addToBatch,
    ).toBe('hidden')
  })

  test('no preview and none coming: no Add to batch', () => {
    expect(
      sendActions({ ...base, mode: 'smart', preview: undefined }).addToBatch,
    ).toBe('hidden')
  })

  test("the preview's mode wins over the one known before it", () => {
    expect(
      sendActions({ ...base, mode: 'smart', preview: preview({ mode: 'plain-never' }) })
        .addToBatch,
    ).toBe('hidden')
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
  test('modeName', () => {
    expect(modeName('smart')).toBe('Smart')
    expect(modeName('plain-upgradable')).toBe('Plain (upgradable)')
    expect(modeName('plain-never')).toBe('Plain')
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

describe('estimatedCost', () => {
  // A plain account's send goes to the node as it is.
  const plain = (overrides: Partial<SendPreview> = {}) =>
    preview({
      mode: 'plain-never',
      onchain: { kind: 'eoa' },
      path: 'sequential',
      payer: ACCOUNT,
      sponsored: false,
      // 46,000 gas at the node's 2 gwei
      estimatedCostWei: '92000000000000',
      simulation: { ok: true, gasUsed: '46000', balanceChanges: [] },
      ...overrides,
    })
  const GWEI = 10n ** 9n

  test("the preview's estimate when the dApp sets no fee or gas", () => {
    expect(estimatedCost('eth_sendTransaction', plain(), {})).toBe(92_000n * GWEI)
  })

  test("a pass-through send costs the dApp's fee per gas", () => {
    expect(
      estimatedCost('eth_sendTransaction', plain(), {
        maxFeePerGas: '0x12a05f200', // 5 gwei
      }),
    ).toBe(46_000n * 5n * GWEI)
    expect(
      estimatedCost('eth_sendTransaction', plain(), { gasPrice: '0x3b9aca00' }),
    ).toBe(46_000n * GWEI)
  })

  test('a gas limit under the simulated gas caps the cost: the send runs out of gas', () => {
    expect(
      estimatedCost('eth_sendTransaction', plain(), { gas: '0x5208' }),
    ).toBe(21_000n * 2n * GWEI)
    // Above it, the send uses what it needs.
    expect(
      estimatedCost('eth_sendTransaction', plain(), { gas: '0xf4240' }),
    ).toBe(92_000n * GWEI)
  })

  test('without simulated gas, the gas limit and fee bound it', () => {
    const unknown = plain({
      estimatedCostWei: null,
      simulation: { ok: true, gasUsed: null, balanceChanges: null },
    })
    expect(
      estimatedCost('eth_sendTransaction', unknown, {
        gas: '0x5208',
        maxFeePerGas: '0x3b9aca00',
      }),
    ).toBe(21_000n * GWEI)
    expect(
      estimatedCost('eth_sendTransaction', unknown, { gas: '0x5208' }),
    ).toBeNull()
  })

  test('smart accounts pick their own gas and fees: the dApp\'s are ignored', () => {
    expect(
      estimatedCost('eth_sendTransaction', preview(), {
        gas: '0x5208',
        maxFeePerGas: '0x12a05f200',
      }),
    ).toBe(46_000_000_000_000n)
    expect(estimatedCost('wallet_sendCalls', plain(), undefined)).toBe(
      92_000n * GWEI,
    )
  })
})

describe('gasShortfall', () => {
  const plain = preview({
    mode: 'plain-upgradable',
    onchain: { kind: 'eoa' },
    path: 'sequential',
    payer: ACCOUNT,
    sponsored: false,
  })

  test("a pass-through send's gas limit under the simulated gas", () => {
    expect(gasShortfall('eth_sendTransaction', plain, { gas: '0x5208' })).toEqual(
      { limit: 21_000n, used: 46_000n },
    )
  })

  test('none when the limit is enough, absent, or ignored', () => {
    expect(gasShortfall('eth_sendTransaction', plain, { gas: '0xb3b0' })).toBeNull()
    expect(gasShortfall('eth_sendTransaction', plain, {})).toBeNull()
    expect(
      gasShortfall('eth_sendTransaction', preview(), { gas: '0x5208' }),
    ).toBeNull()
    expect(gasShortfall('eth_sendTransaction', reverting({ mode: 'plain-never' }), { gas: '0x1' })).toBeNull()
  })
})
