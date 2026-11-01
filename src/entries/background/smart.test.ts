// The background glue against a real Anvil. The chrome-bound stores and
// messengers are replaced by in-memory fakes before `./smart` is imported.
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import {
  type Address,
  type Hex,
  type RpcTransaction,
  getAddress,
  numberToHex,
} from 'viem'

import {
  type BatchRecord,
  type BatchRecordsState,
  clearRecords,
  getRecord,
  putRecord,
} from '~/smart/batch-records'
import { ENTRY_POINT_07, KERNEL_V3_3 } from '~/smart/constants'
import { delegationCode } from '~/smart/kernel'
import { type Node, connectNode } from '~/smart/node'
import { DEV_ACCOUNTS, startAnvil, waitForReceipt } from '~/smart/testing/anvil'
import type { AccountMode, SponsorSetting } from '~/smart/types'
import type { RpcRequest } from '~/types/rpc'

import type { Decision } from './pending-requests'

// -- fakes --------------------------------------------------------------------

type FakeAccount = {
  address: Address
  key: string
  rpcUrl?: string
  impersonate?: boolean
}

const persist = {
  hasHydrated: () => true,
  onFinishHydration: () => () => {},
}
const accountState: { account?: FakeAccount; accounts: FakeAccount[] } = {
  accounts: [],
}
const modes = new Map<string, AccountMode>()
const modeKey = (rpcUrl: string, address: Address) =>
  `${rpcUrl}.${address.toLowerCase()}`
let records: BatchRecordsState = { records: {} }
const settings: { sponsor: SponsorSetting } = { sponsor: { kind: 'devwallet' } }

mock.module('~/zustand', () => ({
  accountStore: { persist, getState: () => accountState },
  accountModesStore: {
    persist,
    getState: () => ({
      getMode: (a: { rpcUrl: string; address: Address }) =>
        modes.get(modeKey(a.rpcUrl, a.address)),
      setMode: (a: { rpcUrl: string; address: Address; mode: AccountMode }) =>
        void modes.set(modeKey(a.rpcUrl, a.address), a.mode),
    }),
  },
  batchCallsStore: {
    persist,
    getState: () => ({
      getRecord: (rpcUrl: string, id: string) => getRecord(records, rpcUrl, id),
      putRecord: (record: BatchRecord) => {
        records = putRecord(records, record)
      },
      clearRecords: (rpcUrl: string) => {
        records = clearRecords(records, rpcUrl)
      },
    }),
  },
  settingsStore: { persist, getState: () => settings },
}))

const sent: [string, unknown][] = []
const handlers = new Map<string, (payload: any) => Promise<any>>()
mock.module('~/messengers', () => ({
  getMessenger: () => ({
    send: async (topic: string, payload: unknown) => {
      sent.push([topic, payload])
    },
    reply: (topic: string, handler: (payload: any) => Promise<any>) => {
      handlers.set(topic, handler)
      return () => {}
    },
  }),
}))

const {
  handleSend,
  reconcileForRpc,
  setupSmartHandlers,
  showCallsStatus,
  walletRequest,
} = await import('./smart')
setupSmartHandlers()

// -- helpers ------------------------------------------------------------------

const smart = DEV_ACCOUNTS[1]
const upgradable = DEV_ACCOUNTS[2]
const never = DEV_ACCOUNTS[3]
const X = getAddress('0x00000000000000000000000000000000000a0a0a')
const R = getAddress('0x00000000000000000000000000000000000dead0')
// Runtime code that reverts with the 4 bytes `0xdeadbeef`.
const REVERTER_CODE = '0x63deadbeef5f526004601cfd'
const transfer = { to: X, value: numberToHex(1n) }

let anvil: { rpcUrl: string; stop(): Promise<void> }
let rpcUrl: string
let node: Node
let nextId = 1

beforeEach(async () => {
  anvil = await startAnvil()
  rpcUrl = anvil.rpcUrl
  node = await connectNode({ rpcUrl })
  await node.setCode(R, REVERTER_CODE)
  const account = (address: Address): FakeAccount => ({
    address,
    key: `${rpcUrl}.${address}`,
    rpcUrl,
  })
  accountState.accounts = [smart, upgradable, never].map(account)
  accountState.account = accountState.accounts[0]
  modes.clear()
  modes.set(modeKey(rpcUrl, upgradable), 'plain-upgradable')
  modes.set(modeKey(rpcUrl, never), 'plain-never')
  records = { records: {} }
  settings.sponsor = { kind: 'devwallet' }
  sent.length = 0
})
afterEach(() => anvil.stop())

function sendCallsRequest(
  from: Address,
  calls: object[],
  extra: object = {},
): RpcRequest {
  return {
    id: nextId++,
    method: 'wallet_sendCalls',
    params: [{ version: '2.0.0', chainId: '0x7a69', from, calls, ...extra }],
  } as unknown as RpcRequest
}

function sendTransactionRequest(tx: object): RpcRequest {
  return {
    id: nextId++,
    method: 'eth_sendTransaction',
    params: [tx],
  } as unknown as RpcRequest
}

/** An approval that answers `decision`, recording what it was asked. */
function answering(decision: (request: RpcRequest) => Decision) {
  const asked: RpcRequest[] = []
  const ask = async (request: RpcRequest) => {
    asked.push(request)
    return decision(request)
  }
  return { ask, asked }
}

const approve = (force = false) =>
  answering((request) => ({ status: 'approved', request, force }))

/** Sends a `wallet_sendCalls` and returns its batch id. */
async function sendBatch(
  request: RpcRequest,
  ask?: (request: RpcRequest) => Promise<Decision>,
): Promise<string> {
  const outcome = await handleSend({ rpcUrl, request, ask })
  if (!('result' in outcome)) throw new Error('wallet_sendCalls passed through')
  return (outcome.result as { id: string }).id
}

async function codeOf(error: Promise<unknown>) {
  try {
    await error
  } catch (e) {
    return e as { code: number; message: string; data?: unknown }
  }
  throw new Error('expected a rejection')
}

async function callsStatus(id: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const status = (await walletRequest(rpcUrl, {
      method: 'wallet_getCallsStatus',
      params: [id],
    })) as { status: number }
    if (status.status !== 100) return status
    await Bun.sleep(20)
  }
  throw new Error(`batch ${id} stayed pending`)
}

async function transaction(hash: Hex) {
  await waitForReceipt(node, hash)
  return node.request<RpcTransaction>('eth_getTransactionByHash', [hash])
}

// -- tests --------------------------------------------------------------------

describe('reconcileForRpc', () => {
  test('makes the node match the modes, and is memoized for a second', async () => {
    const deps = await reconcileForRpc(rpcUrl)
    expect(deps.activeAccount).toBe(smart)
    expect(deps.accounts.map((a) => [a.address, a.mode, a.onchain.kind])).toEqual([
      [smart, 'smart', 'kernel'],
      [upgradable, 'plain-upgradable', 'eoa'],
      [never, 'plain-never', 'eoa'],
    ])
    expect(await node.getCode(smart)).toBe(delegationCode(KERNEL_V3_3))

    // Within the second, the memo answers without looking at the node.
    await node.setCode(smart, '0x')
    await reconcileForRpc(rpcUrl)
    expect(await node.getCode(smart)).toBe('0x')

    await Bun.sleep(1050)
    await reconcileForRpc(rpcUrl)
    expect(await node.getCode(smart)).toBe(delegationCode(KERNEL_V3_3))
  })

  test('after a node reset, puts the delegation back and forgets the batches', async () => {
    await node.request('anvil_mine', ['0x3'])
    const id = await sendBatch(sendCallsRequest(smart, [transfer]))
    expect(getRecord(records, rpcUrl, id)).toBeDefined()
    // Anvil can still be mining the user op when the send returns; a reset in
    // the middle of that hangs or leaves the block number where it was.
    expect((await callsStatus(id)).status).toBe(200)

    await node.request('anvil_reset', [])
    expect(await node.getCode(smart)).toBe('0x')
    await Bun.sleep(1050)

    await reconcileForRpc(rpcUrl)
    expect(await node.getCode(smart)).toBe(delegationCode(KERNEL_V3_3))
    expect(getRecord(records, rpcUrl, id)).toBeUndefined()
    expect(
      await codeOf(
        walletRequest(rpcUrl, { method: 'wallet_getCallsStatus', params: [id] }),
      ),
    ).toMatchObject({ code: 5730 })
  })

  test('a failed reconcile is not remembered', async () => {
    accountState.accounts = []
    const down = 'http://127.0.0.1:9'
    await expect(reconcileForRpc(down)).rejects.toThrow()
    await expect(reconcileForRpc(down)).rejects.toThrow()
  })
})

describe('wallet_sendCalls', () => {
  test('a smart account batch with nobody asked is a sponsored user op', async () => {
    const id = await sendBatch(
      sendCallsRequest(smart, [transfer, transfer], { atomicRequired: true }),
    )
    const record = getRecord(records, rpcUrl, id)
    expect(record?.path).toBe('userop')
    expect((await callsStatus(id)).status).toBe(200)
    const [hash] = record?.transactionHashes ?? []
    expect((await transaction(hash as Hex)).to).toBe(
      ENTRY_POINT_07.toLowerCase() as Address,
    )
  })

  test('a predicted revert with nobody asked is code 3 and records nothing', async () => {
    const error = await codeOf(
      handleSend({
        rpcUrl,
        request: sendCallsRequest(smart, [transfer, { to: R }]),
      }),
    )
    expect(error.code).toBe(3)
    expect(error.data).toBe('0xdeadbeef')
    expect(records.records[rpcUrl]).toBeUndefined()
  })

  test('"Sign anyway" sends the reverting batch as a self-call', async () => {
    const { ask } = approve(true)
    const id = await sendBatch(
      sendCallsRequest(smart, [transfer, { to: R }]),
      ask,
    )
    expect(getRecord(records, rpcUrl, id)?.path).toBe('self-call')
    expect((await callsStatus(id)).status).toBe(500)
  })

  test('the approved request is the one executed', async () => {
    const { ask } = answering(() => ({
      status: 'approved',
      request: sendCallsRequest(smart, [{ to: X, value: numberToHex(7n) }], {
        id: 'edited',
      }),
    }))
    await handleSend({ rpcUrl, request: sendCallsRequest(smart, [transfer]), ask })
    expect(getRecord(records, rpcUrl, 'edited')?.calls).toEqual([
      { to: X, value: '0x7' },
    ])
  })

  test('a malformed batch fails before anyone is asked', async () => {
    const { ask, asked } = approve()
    const error = await codeOf(
      handleSend({
        rpcUrl,
        request: sendCallsRequest(smart, [transfer], { version: '1.0' }),
        ask,
      }),
    )
    expect(error.code).toBe(-32602)
    expect(asked).toHaveLength(0)
  })

  test.each([
    ['rejected', 4001],
    ['expired', 4001],
    ['batched', 4001],
  ] as const)('a %s decision is %d', async (status, code) => {
    const { ask } = answering(() => ({ status }))
    const error = await codeOf(
      handleSend({ rpcUrl, request: sendCallsRequest(smart, [transfer]), ask }),
    )
    expect(error.code).toBe(code)
  })

  test('plain-never: atomicRequired is 5760, otherwise one transaction per call', async () => {
    const error = await codeOf(
      handleSend({
        rpcUrl,
        request: sendCallsRequest(never, [transfer, transfer], {
          atomicRequired: true,
        }),
      }),
    )
    expect(error.code).toBe(5760)

    const id = await sendBatch(sendCallsRequest(never, [transfer, transfer]))
    const record = getRecord(records, rpcUrl, id)
    expect(record?.path).toBe('sequential')
    expect(record?.transactionHashes).toHaveLength(2)
    expect((await callsStatus(id)).status).toBe(200)
    expect(await node.getCode(never)).toBe('0x')
  })

  describe('plain-upgradable', () => {
    test('rejecting the upgrade is 5750 and changes nothing', async () => {
      const { ask } = answering(() => ({ status: 'rejected' }))
      const error = await codeOf(
        handleSend({
          rpcUrl,
          request: sendCallsRequest(upgradable, [transfer]),
          ask,
        }),
      )
      expect(error.code).toBe(5750)
      expect(await node.getCode(upgradable)).toBe('0x')
      expect(modes.get(modeKey(rpcUrl, upgradable))).toBe('plain-upgradable')
    })

    test('approving upgrades the account, then sends', async () => {
      const { ask } = approve()
      const id = await sendBatch(
        sendCallsRequest(upgradable, [transfer, transfer], {
          atomicRequired: true,
        }),
        ask,
      )
      expect(await node.getCode(upgradable)).toBe(delegationCode(KERNEL_V3_3))
      expect(modes.get(modeKey(rpcUrl, upgradable))).toBe('smart')
      expect(getRecord(records, rpcUrl, id)?.path).toBe('userop')
      expect(sent.some(([topic]) => topic === 'notice')).toBe(false)
    })

    test('with bypass, upgrades silently and sends a notice', async () => {
      await handleSend({
        rpcUrl,
        request: sendCallsRequest(upgradable, [transfer]),
      })
      expect(await node.getCode(upgradable)).toBe(delegationCode(KERNEL_V3_3))
      expect(sent).toContainEqual([
        'notice',
        { message: `Upgraded ${upgradable} to a Kernel smart account.` },
      ])
    })
  })
})

describe('eth_sendTransaction', () => {
  test('from a smart account, goes out as a user op and returns its hash', async () => {
    const outcome = await handleSend({
      rpcUrl,
      request: sendTransactionRequest({
        from: smart,
        ...transfer,
        // The dApp's own gas, nonce and fees are ignored on the smart path.
        gas: '0x1',
        nonce: '0x99',
        maxFeePerGas: '0x1',
      }),
    })
    expect(outcome).toEqual({ result: expect.stringMatching(/^0x[0-9a-f]{64}$/) })
    const { result: hash } = outcome as { result: Hex }
    expect((await transaction(hash)).to).toBe(
      ENTRY_POINT_07.toLowerCase() as Address,
    )
    expect(await node.getBalance(X)).toBe(1n)
  })

  test('the edited transaction from the approval is the one sent', async () => {
    const { ask } = answering((request) => ({
      status: 'approved',
      request: sendTransactionRequest({
        ...(request.params as object[])[0],
        value: numberToHex(5n),
      }),
    }))
    const { result: hash } = (await handleSend({
      rpcUrl,
      request: sendTransactionRequest({ from: smart, ...transfer }),
      ask,
    })) as { result: Hex }
    await waitForReceipt(node, hash)
    expect(await node.getBalance(X)).toBe(5n)
  })

  test('a predicted revert with nobody asked is code 3', async () => {
    const error = await codeOf(
      handleSend({
        rpcUrl,
        request: sendTransactionRequest({ from: smart, to: R }),
      }),
    )
    expect(error.code).toBe(3)
    expect(error.data).toBe('0xdeadbeef')
  })

  test('from a plain account, or an address the wallet does not hold, passes through', async () => {
    for (const from of [never, upgradable, DEV_ACCOUNTS[5]]) {
      const request = sendTransactionRequest({ from, ...transfer })
      expect(await handleSend({ rpcUrl, request })).toEqual({
        passThrough: request,
      })
    }
    expect(await node.getCode(upgradable)).toBe('0x')
  })

  test('a rejected one is 4001, even for a plain-upgradable account', async () => {
    const { ask } = answering(() => ({ status: 'rejected' }))
    const error = await codeOf(
      handleSend({
        rpcUrl,
        request: sendTransactionRequest({ from: upgradable, ...transfer }),
        ask,
      }),
    )
    expect(error.code).toBe(4001)
  })
})

describe('reads', () => {
  test('wallet_getCapabilities reports each mode', async () => {
    const capabilities = async (address: Address) =>
      (await walletRequest(rpcUrl, {
        method: 'wallet_getCapabilities',
        params: [address],
      })) as Record<Hex, { atomic: { status: string } }>
    expect(await capabilities(smart)).toEqual({
      '0x7a69': { atomic: { status: 'supported' } },
    })
    expect((await capabilities(upgradable))['0x7a69']?.atomic.status).toBe(
      'ready',
    )
    expect((await capabilities(never))['0x7a69']?.atomic.status).toBe(
      'unsupported',
    )
  })

  test('wallet_showCallsStatus opens the first transaction, or is 5730', async () => {
    const id = await sendBatch(sendCallsRequest(never, [transfer, transfer]))
    const record = getRecord(records, rpcUrl, id)
    expect(await showCallsStatus(rpcUrl, [id])).toBeNull()
    expect(sent).toContainEqual([
      'pushRoute',
      `/transaction/${record?.transactionHashes[0]}`,
    ])
    expect(await codeOf(showCallsStatus(rpcUrl, ['0xnope']))).toMatchObject({
      code: 5730,
    })
  })
})

describe('wallet UI messages', () => {
  const call = (topic: string, payload: unknown) => {
    const handler = handlers.get(topic)
    if (!handler) throw new Error(`no handler for ${topic}`)
    return handler(payload)
  }

  test('smartStatus is the AA status of the last reconcile', async () => {
    expect(await call('smartStatus', { rpcUrl })).toMatchObject({ ok: true })
  })

  test('previewSend previews a plain-upgradable batch as smart, but not a transaction', async () => {
    const preview = await call('previewSend', {
      rpcUrl,
      from: upgradable,
      calls: [transfer, transfer],
      atomicRequired: true,
    })
    expect(preview).toMatchObject({
      mode: 'plain-upgradable',
      atomicStatus: 'ready',
      path: 'userop',
    })
    expect(JSON.parse(JSON.stringify(preview))).toStrictEqual(preview)

    expect(
      await call('previewSend', {
        rpcUrl,
        from: upgradable,
        calls: [transfer],
        atomicRequired: false,
        method: 'eth_sendTransaction',
      }),
    ).toMatchObject({ path: 'sequential' })
    // Previewing writes nothing.
    expect(await node.getCode(upgradable)).toBe('0x')
  })

  test('setAccountMode: revoke clears the delegation and makes it upgradable', async () => {
    await reconcileForRpc(rpcUrl)
    expect(
      await call('setAccountMode', { rpcUrl, address: smart, action: 'revoke' }),
    ).toEqual({
      address: smart,
      mode: 'plain-upgradable',
      onchain: { kind: 'eoa' },
      changed: true,
    })
    expect(await node.getCode(smart)).toBe('0x')
    expect(modes.get(modeKey(rpcUrl, smart))).toBe('plain-upgradable')
  })

  test('setAccountMode: switch-to-kernel replaces a foreign delegation', async () => {
    await node.setCode(never, delegationCode(X))
    expect(
      await call('setAccountMode', {
        rpcUrl,
        address: never,
        action: 'switch-to-kernel',
      }),
    ).toEqual({
      address: never,
      mode: 'smart',
      onchain: { kind: 'kernel' },
      changed: true,
    })
    expect(await node.getCode(never)).toBe(delegationCode(KERNEL_V3_3))
  })

  test('setAccountMode: switch-to-kernel never overwrites a contract', async () => {
    await node.setCode(never, '0x6000')
    await expect(
      call('setAccountMode', { rpcUrl, address: never, action: 'switch-to-kernel' }),
    ).rejects.toThrow(/contract code/)
    expect(await node.getCode(never)).toBe('0x6000')
  })

  test('setAccountMode: a mode is stored and applied at once', async () => {
    await reconcileForRpc(rpcUrl)
    expect(
      await call('setAccountMode', {
        rpcUrl,
        address: smart,
        action: 'plain-never',
      }),
    ).toEqual({
      address: smart,
      mode: 'plain-never',
      onchain: { kind: 'eoa' },
      changed: true,
    })
    expect(await node.getCode(smart)).toBe('0x')
  })
})
