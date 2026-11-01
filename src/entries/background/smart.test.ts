// The background glue against a real Anvil. The chrome-bound stores and
// messengers are replaced by in-memory fakes before `./smart` is imported.
//
// `mock.module` replaces `~/zustand` and `~/messengers` for the whole `bun test`
// process and is never restored: any test file that imports them after this
// one runs gets these fakes too.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'
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
import { BATCH_CHANGED } from '~/smart/errors'
import { delegationCode } from '~/smart/kernel'
import { type Node, connectNode } from '~/smart/node'
import type { BatchQueue, QueuedItem } from '~/smart/queue'
import { DEV_ACCOUNTS, startAnvil, waitForReceipt } from '~/smart/testing/anvil'
import type { AccountMode, SponsorSetting } from '~/smart/types'
import type { RpcRequest, RpcResponse } from '~/types/rpc'

import type { Batcher, Decision } from './pending-requests'
import type { SendOutcome } from './smart-sends'

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
const settings: {
  sponsor: SponsorSetting
  bypassSignatureAuth?: boolean
  bypassTransactionAuth?: boolean
  bypassConnectAuth?: boolean
} = { sponsor: { kind: 'devwallet' } }

/** A fake store with `subscribe`, like zustand's: listeners get (next, prev). */
function observable<T>(initial: T) {
  let state = initial
  const listeners = new Set<(next: T, prev: T) => void>()
  return {
    get: () => state,
    set(next: T) {
      const prev = state
      state = next
      for (const listener of listeners) listener(next, prev)
    },
    subscribe(listener: (next: T, prev: T) => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}
const batchQueue = observable<{ queue: BatchQueue | null }>({ queue: null })
const network = observable({ network: { rpcUrl: '' }, onboarded: true })
let connectedHosts: Set<string> | null = null
const pendingRequests: (RpcRequest & {
  sender?: { tab?: { id?: number } }
})[] = []

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
  batchQueueStore: {
    persist,
    subscribe: batchQueue.subscribe,
    getState: batchQueue.get,
    setState: (partial: { queue: BatchQueue | null }) =>
      batchQueue.set({ ...batchQueue.get(), ...partial }),
  },
  networkStore: {
    persist,
    subscribe: network.subscribe,
    getState: network.get,
  },
  // Every site is connected, unless a test names the connected hosts.
  sessionsStore: {
    persist,
    getState: () => ({
      getSession: ({ host }: { host: string }) =>
        connectedHosts === null || connectedHosts.has(host)
          ? { host }
          : undefined,
      addSession: ({ session }: { session: { host: string } }) =>
        void connectedHosts?.add(session.host),
    }),
  },
  pendingRequestsStore: {
    persist,
    getState: () => ({
      pendingRequests,
      addPendingRequest: (request: (typeof pendingRequests)[number]) =>
        void pendingRequests.push(request),
      removePendingRequest: (id: number) => {
        const index = pendingRequests.findIndex((r) => r.id === id)
        if (index >= 0) pendingRequests.splice(index, 1)
      },
    }),
  },
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
  reconcileBeforeAnswering,
  reconcileForRpc,
  setupSmartHandlers,
  showCallsStatus,
  walletRequest,
} = await import('./smart')
const smartSends = await import('./smart-sends')
const { closeStaleBatch, setupBatchQueue } = await import('./batch-queue')
const { requestUserDecision, setupPendingRequests } = await import(
  './pending-requests'
)
const { setupRpcHandler } = await import('./rpc')
setupSmartHandlers()
setupBatchQueue()
setupPendingRequests()

const SITE = 'a.test'
/** `handleSend`, from a site unless `origin` says otherwise. */
const handleSend = (
  args: Omit<Parameters<typeof smartSends.handleSend>[0], 'origin'> & {
    origin?: string
  },
) => smartSends.handleSend({ origin: SITE, ...args })

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
  network.set({ network: { rpcUrl }, onboarded: true })
  batchQueue.set({ queue: null })
  pendingRequests.length = 0
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

  test('reconcileBeforeAnswering waits for a slow node only so long', async () => {
    // A node that never answers.
    const server = Bun.serve({ port: 0, fetch: () => new Promise(() => {}) })
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    let warnings = 0
    try {
      const started = Date.now()
      await reconcileBeforeAnswering(`http://127.0.0.1:${server.port}`, {
        timeoutMs: 100,
      })
      expect(Date.now() - started).toBeLessThan(1000)
    } finally {
      server.stop(true)
      // The reconcile carries on until the server hangs up, then warns.
      for (let i = 0; i < 50 && warn.mock.calls.length === 0; i++) {
        await Bun.sleep(20)
      }
      warnings = warn.mock.calls.length
      warn.mockRestore()
    }
    expect(warnings).toBe(1)
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
  ] as const)('a %s decision is %d', async (status, code) => {
    const { ask } = answering(() => ({ status }))
    const error = await codeOf(
      handleSend({ rpcUrl, request: sendCallsRequest(smart, [transfer]), ask }),
    )
    expect(error.code).toBe(code)
  })

  test('plain-never: atomicRequired is 5760 before anyone is asked, otherwise one transaction per call', async () => {
    const { ask, asked } = approve()
    const error = await codeOf(
      handleSend({
        rpcUrl,
        request: sendCallsRequest(never, [transfer, transfer], {
          atomicRequired: true,
        }),
        ask,
      }),
    )
    expect(error.code).toBe(5760)
    expect(asked).toHaveLength(0)

    const id = await sendBatch(sendCallsRequest(never, [transfer, transfer]))
    const record = getRecord(records, rpcUrl, id)
    expect(record?.path).toBe('sequential')
    expect(record?.transactionHashes).toHaveLength(2)
    expect((await callsStatus(id)).status).toBe(200)
    expect(await node.getCode(never)).toBe('0x')
  })

  test('concurrent sends go out one at a time, each a sponsored user op', async () => {
    const ids = await Promise.all(
      [1, 2, 3].map(() => sendBatch(sendCallsRequest(smart, [transfer]))),
    )
    for (const id of ids) {
      expect(getRecord(records, rpcUrl, id)?.path).toBe('userop')
      expect((await callsStatus(id)).status).toBe(200)
    }
    expect(await node.getBalance(X)).toBe(3n)
  })

  test('an impersonated smart account pays its own gas with a self-call', async () => {
    const I = getAddress('0x00000000000000000000000000000000000b0b0b')
    await node.setBalance(I, 10n ** 18n)
    accountState.accounts.push({
      address: I,
      key: `${rpcUrl}.${I}`,
      rpcUrl,
      impersonate: true,
    })
    modes.set(modeKey(rpcUrl, I), 'smart')
    const batch = { rpcUrl, from: I, calls: [transfer, transfer] }

    const preview = await handlers.get('previewSend')?.({
      ...batch,
      atomicRequired: true,
      method: 'wallet_sendCalls',
    })
    expect(preview).toMatchObject({
      path: 'self-call',
      payer: I,
      sponsored: false,
      fallbackReason:
        "Impersonated accounts can't sign, so they pay their own gas.",
    })

    const id = await sendBatch(
      sendCallsRequest(I, batch.calls, { atomicRequired: true }),
    )
    const record = getRecord(records, rpcUrl, id)
    expect(record?.path).toBe('self-call')
    expect((await callsStatus(id)).status).toBe(200)
    const tx = await transaction(record?.transactionHashes[0] as Hex)
    expect([tx.from, tx.to]).toEqual([
      I.toLowerCase() as Address,
      I.toLowerCase() as Address,
    ])
    expect(await node.getBalance(X)).toBe(2n)
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

    test('with bypass, a predicted revert is code 3 and leaves the account alone', async () => {
      const error = await codeOf(
        handleSend({
          rpcUrl,
          request: sendCallsRequest(upgradable, [transfer, { to: R }]),
        }),
      )
      expect(error.code).toBe(3)
      expect(error.data).toBe('0xdeadbeef')
      expect(await node.getCode(upgradable)).toBe('0x')
      expect(modes.get(modeKey(rpcUrl, upgradable))).toBe('plain-upgradable')
      expect(sent.some(([topic]) => topic === 'notice')).toBe(false)
      expect(records.records[rpcUrl]).toBeUndefined()
    })

    test('"Sign anyway" upgrades, then sends the reverting batch as a self-call', async () => {
      const { ask } = approve(true)
      const id = await sendBatch(
        sendCallsRequest(upgradable, [transfer, { to: R }]),
        ask,
      )
      expect(await node.getCode(upgradable)).toBe(delegationCode(KERNEL_V3_3))
      expect(getRecord(records, rpcUrl, id)?.path).toBe('self-call')
      expect((await callsStatus(id)).status).toBe(500)
    })

    test('a mode changed to plain-never during the approval is not upgraded', async () => {
      const { ask } = answering((request) => {
        modes.set(modeKey(rpcUrl, upgradable), 'plain-never')
        return { status: 'approved', request }
      })
      const id = await sendBatch(
        sendCallsRequest(upgradable, [transfer, transfer]),
        ask,
      )
      expect(await node.getCode(upgradable)).toBe('0x')
      expect(modes.get(modeKey(rpcUrl, upgradable))).toBe('plain-never')
      expect(getRecord(records, rpcUrl, id)?.path).toBe('sequential')
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

describe('batch queue', () => {
  const queueNow = () => batchQueue.get().queue
  const queuedIds = () => queueNow()?.items.map((i) => i.requestId) ?? []
  const OFF = 'http://127.0.0.1:1'

  const call = (topic: string, payload: unknown) => {
    const handler = handlers.get(topic)
    if (!handler) throw new Error(`no handler for ${topic}`)
    return handler(payload)
  }
  const batchAction = (payload: unknown) => call('batchQueue', payload)
  /** The side panel's "Start batch". */
  const startBatch = (account: Address = smart) =>
    batchAction({ action: 'open', rpcUrl, account })
  /** The review's Sign, having seen the batch as it is now. */
  const sign = (extra: object = {}) =>
    batchAction({ action: 'sign', reviewed: queuedIds(), ...extra })

  /** The approval screen's "Add to batch", without the pending store. */
  const addToBatch = async (
    request: RpcRequest,
    { batch }: { batch: Batcher },
  ): Promise<Decision> => ({ status: 'batched', ...(await batch(request)) })
  /** The real approval: the test decides with `pendingRequest` messages. */
  const viaApproval = (request: RpcRequest, options: { batch: Batcher }) =>
    requestUserDecision(request, options)
  const pendingWith = (id: number) => pendingRequests.find((r) => r.id === id)

  async function until(condition: () => boolean, what: string) {
    for (let i = 0; i < 300; i++) {
      if (condition()) return
      await Bun.sleep(10)
    }
    throw new Error(`timed out waiting for ${what}`)
  }

  /** Starts a send that is expected to wait in the batch. */
  function startSend(
    request: RpcRequest,
    ask?: Parameters<typeof handleSend>[0]['ask'],
  ): Promise<SendOutcome> {
    const outcome = handleSend({ rpcUrl, request, ask })
    // Observed later by the test; never an unhandled rejection meanwhile.
    outcome.catch(() => {})
    return outcome
  }

  /** A send waiting in the batch (wrapped: awaiting it must not wait for it). */
  type Waiting = { outcome: Promise<SendOutcome> }

  async function joined(
    request: RpcRequest,
    ask?: Parameters<typeof startSend>[1],
  ): Promise<Waiting> {
    const outcome = startSend(request, ask)
    await until(() => queuedIds().includes(request.id), 'the send to join')
    return { outcome }
  }

  async function responseOf(
    send: Waiting | Promise<SendOutcome>,
  ): Promise<RpcResponse> {
    const settled = await ('outcome' in send ? send.outcome : send)
    if (!('response' in settled)) {
      throw new Error('the send did not wait in the batch')
    }
    return settled.response
  }

  test('with bypass, sends join the open batch unasked, then go out as one user op', async () => {
    expect(await startBatch()).toEqual({ ok: true })
    const tx = sendTransactionRequest({ from: smart, ...transfer })
    const txOutcome = await joined(tx)
    const batch = sendCallsRequest(smart, [transfer, transfer], {
      id: 'dapp-batch',
    })
    const batchOutcome = await joined(batch)

    // Nothing has gone out yet.
    expect(await node.getBalance(X)).toBe(0n)
    expect(
      queueNow()?.items.map((i) => [i.requestId, i.origin, i.method, i.bundleId]),
    ).toEqual([
      [tx.id, SITE, 'eth_sendTransaction', undefined],
      [batch.id, SITE, 'wallet_sendCalls', 'dapp-batch'],
    ])

    expect(await sign()).toEqual({ ok: true })
    const hash = (await responseOf(txOutcome)).result as Hex
    expect(await responseOf(batchOutcome)).toEqual({
      id: batch.id,
      jsonrpc: '2.0',
      result: { id: 'dapp-batch' },
    })
    expect((await transaction(hash)).to).toBe(
      ENTRY_POINT_07.toLowerCase() as Address,
    )
    expect(getRecord(records, rpcUrl, 'dapp-batch')).toMatchObject({
      path: 'userop',
      transactionHashes: [hash],
      calls: [transfer, transfer],
    })
    expect((await callsStatus('dapp-batch')).status).toBe(200)
    expect(await node.getBalance(X)).toBe(3n)
    expect(queueNow()).toBeNull()
  })

  test('with bypass, a send that cannot join goes out now', async () => {
    await startBatch()
    // A plain account's transaction passes through, as without a batch.
    const plain = sendTransactionRequest({ from: never, ...transfer })
    expect(await handleSend({ rpcUrl, request: plain })).toEqual({
      passThrough: plain,
    })
    // A deployment from the batch's own account is sent on its own.
    const deployed = await handleSend({
      rpcUrl,
      request: sendTransactionRequest({ from: smart, data: '0x00' }),
    })
    expect(deployed).toEqual({ result: expect.stringMatching(/^0x/) })
    expect(queuedIds()).toEqual([])
  })

  test('"Add to batch" opens a batch; "Approve" still sends at once; Discard is 4001', async () => {
    const tx = sendTransactionRequest({ from: smart, ...transfer })
    const outcome = await joined(tx, addToBatch)
    expect(queueNow()).toMatchObject({ rpcUrl, account: smart })

    const { ask } = approve()
    const now = (await handleSend({
      rpcUrl,
      request: sendTransactionRequest({ from: smart, to: X, value: '0x5' }),
      ask,
    })) as { result: Hex }
    await waitForReceipt(node, now.result)
    expect(await node.getBalance(X)).toBe(5n)
    expect(queuedIds()).toEqual([tx.id])

    expect(await batchAction({ action: 'discard' })).toEqual({ ok: true })
    expect((await responseOf(outcome)).error).toMatchObject({
      code: 4001,
      message: 'The user discarded the batch.',
    })
    expect(queueNow()).toBeNull()
    expect(await node.getBalance(X)).toBe(5n)
  })

  test('"Start batch" opens an empty batch, and refuses what "Add to batch" refuses', async () => {
    const other = DEV_ACCOUNTS[4]
    accountState.accounts.push({ address: other, key: `${rpcUrl}.${other}`, rpcUrl })

    expect(await startBatch(never)).toMatchObject({
      ok: false,
      error: { code: -32602, message: expect.stringMatching(/Only smart accounts/) },
    })
    network.set({ network: { rpcUrl: OFF }, onboarded: true })
    expect(await startBatch()).toMatchObject({
      ok: false,
      error: { code: -32602, message: expect.stringMatching(/active network/) },
    })
    network.set({ network: { rpcUrl }, onboarded: true })
    expect(queueNow()).toBeNull()

    expect(await startBatch(other)).toEqual({ ok: true })
    expect(queueNow()).toMatchObject({ rpcUrl, account: other, items: [] })
    // Opening it again changes nothing; another account's is refused.
    const open = queueNow()
    expect(await startBatch(other)).toEqual({ ok: true })
    expect(queueNow()).toBe(open)
    expect(await startBatch()).toMatchObject({
      ok: false,
      error: { message: expect.stringMatching(`already open for ${other}`) },
    })
  })

  test('a bad batchQueue message is -32602 and changes nothing', async () => {
    await startBatch()
    const tx = sendTransactionRequest({ from: smart, ...transfer })
    const outcome = await joined(tx)
    const before = queueNow()

    for (const payload of [
      undefined,
      { action: 'flush' },
      { action: 'open', rpcUrl },
      { action: 'open', rpcUrl, account: 'nope' },
      { action: 'remove' },
      { action: 'remove', requestId: tx.id + 1 },
      { action: 'move', requestId: tx.id },
      { action: 'move', requestId: tx.id, to: -1 },
      { action: 'move', requestId: tx.id, to: 1 },
      { action: 'move', requestId: tx.id + 1, to: 0 },
      // The positional move it replaced.
      { action: 'move', from: 0, to: 0 },
      { action: 'sign' },
      { action: 'sign', reviewed: String(tx.id) },
      { action: 'sign', reviewed: [String(tx.id)] },
    ]) {
      expect(await batchAction(payload)).toMatchObject({
        ok: false,
        error: { code: -32602 },
      })
    }
    expect(queueNow()).toBe(before)

    await batchAction({ action: 'discard' })
    expect((await responseOf(outcome)).error).toMatchObject({ code: 4001 })
  })

  test.each([
    ['a plain account', () => ({ from: never, ...transfer }), /Only smart accounts/],
    ['a deployment', () => ({ from: smart, data: '0x00' }), /deployment/],
    [
      'a batch open for another account',
      () => {
        modes.set(modeKey(rpcUrl, upgradable), 'smart')
        void startBatch(upgradable)
        return { from: smart, ...transfer }
      },
      new RegExp(`already open for ${upgradable}`),
    ],
    [
      'a network no longer active',
      () => {
        network.set({ network: { rpcUrl: OFF }, onboarded: true })
        return { from: smart, ...transfer }
      },
      /active network/,
    ],
  ])('"Add to batch" with %s is refused, and the request stays pending', async (_, tx, reason) => {
    const request = sendTransactionRequest(tx())
    const outcome = handleSend({ rpcUrl, request, ask: viaApproval })
    await until(() => pendingWith(request.id) !== undefined, 'the approval')

    await expect(
      call('pendingRequest', { request, status: 'batched' }),
    ).rejects.toThrow(reason)
    expect(pendingWith(request.id)).toBeDefined()
    expect(queuedIds()).not.toContain(request.id)

    // Still the user's to decide.
    await call('pendingRequest', { request, status: 'rejected' })
    expect(await codeOf(outcome)).toMatchObject({ code: 4001 })
    expect(pendingRequests).toHaveLength(0)
    expect(await node.getBalance(X)).toBe(0n)
  })

  test('"Add to batch" through the approval: the request leaves the approvals and joins', async () => {
    const request = sendCallsRequest(smart, [transfer])
    const outcome = handleSend({ rpcUrl, request, ask: viaApproval })
    await until(() => pendingWith(request.id) !== undefined, 'the approval')
    await call('pendingRequest', { request, status: 'batched' })
    expect(pendingRequests).toHaveLength(0)
    expect(queuedIds()).toEqual([request.id])

    expect(await sign()).toEqual({ ok: true })
    const { result } = await responseOf(outcome)
    expect(result).toEqual({ id: expect.stringMatching(/^0x[0-9a-f]{64}$/) })
    expect((await callsStatus((result as { id: string }).id)).status).toBe(200)
  })

  test('"Approve" while "Add to batch" is under way is refused, so it is never both', async () => {
    const request = sendTransactionRequest({ from: smart, ...transfer })
    const outcome = startSend(request, viaApproval)
    await until(() => pendingWith(request.id) !== undefined, 'the approval')

    const batched = call('pendingRequest', { request, status: 'batched' })
    await expect(
      call('pendingRequest', { request, status: 'approved' }),
    ).rejects.toThrow(/being added to the batch/)
    await batched
    expect(queuedIds()).toEqual([request.id])

    await batchAction({ action: 'discard' })
    expect((await responseOf(outcome)).error).toMatchObject({ code: 4001 })
    expect(await node.getBalance(X)).toBe(0n)
  })

  test('signing a reverting batch, unforced, gives every request code 3 and closes it', async () => {
    await startBatch()
    const ok = await joined(sendTransactionRequest({ from: smart, ...transfer }))
    const reverting = await joined(sendCallsRequest(smart, [{ to: R }]))

    expect(await sign()).toMatchObject({
      ok: false,
      error: { code: 3, data: '0xdeadbeef' },
    })
    for (const outcome of [ok, reverting]) {
      expect((await responseOf(outcome)).error).toMatchObject({
        code: 3,
        data: '0xdeadbeef',
      })
    }
    expect(queueNow()).toBeNull()
    expect(records.records[rpcUrl]).toBeUndefined()
    expect(await node.getBalance(X)).toBe(0n)
  })

  test('"Sign anyway" sends the reverting batch as a self-call that reverts on chain', async () => {
    await startBatch()
    const ok = await joined(sendTransactionRequest({ from: smart, ...transfer }))
    const reverting = await joined(
      sendCallsRequest(smart, [{ to: R }], { id: 'reverting' }),
    )

    expect(await sign({ force: true })).toEqual({
      ok: true,
    })
    const hash = (await responseOf(ok)).result as Hex
    expect((await waitForReceipt(node, hash)).status).toBe('0x0')
    expect((await responseOf(reverting)).result).toEqual({ id: 'reverting' })
    expect(getRecord(records, rpcUrl, 'reverting')?.path).toBe('self-call')
    expect((await callsStatus('reverting')).status).toBe(500)
    expect(queueNow()).toBeNull()
  })

  test('remove and move, then Sign: only the remaining calls go out, in the new order', async () => {
    // Stores each call's value in slot 0, so the slot shows which ran last.
    const S = getAddress('0x00000000000000000000000000000000000c0c0c')
    await node.setCode(S, '0x345f5500')
    await startBatch()
    const sends = [1n, 2n, 3n].map((value) =>
      sendTransactionRequest({ from: smart, to: S, value: numberToHex(value) }),
    )
    const waiting: Waiting[] = []
    for (const request of sends) waiting.push(await joined(request))
    const [first, second, third] = sends as [RpcRequest, RpcRequest, RpcRequest]
    const [firstSend, secondSend, thirdSend] = waiting as [Waiting, Waiting, Waiting]

    expect(await batchAction({ action: 'remove', requestId: second.id })).toEqual({
      ok: true,
    })
    expect((await responseOf(secondSend)).error).toMatchObject({
      code: 4001,
      message: 'The user removed the request from the batch.',
    })
    expect(
      await batchAction({ action: 'move', requestId: first.id, to: 1 }),
    ).toEqual({ ok: true })
    expect(queuedIds()).toEqual([third.id, first.id])

    expect(await sign()).toEqual({ ok: true })
    const hash = (await responseOf(firstSend)).result
    expect((await responseOf(thirdSend)).result).toBe(hash)
    await waitForReceipt(node, hash as Hex)
    expect(await node.getBalance(S)).toBe(4n)
    expect(await node.request('eth_getStorageAt', [S, '0x0', 'latest'])).toBe(
      numberToHex(1n, { size: 32 }),
    )
  })

  test('a removal sent during Sign waits for it: the request gets its result', async () => {
    await startBatch()
    const request = sendTransactionRequest({ from: smart, ...transfer })
    const outcome = await joined(request)

    const signing = sign()
    const removing = batchAction({ action: 'remove', requestId: request.id })
    expect(await signing).toEqual({ ok: true })
    expect(await removing).toMatchObject({ ok: false, error: { code: -32602 } })
    expect((await responseOf(outcome)).result).toMatch(/^0x[0-9a-f]{64}$/)
  })

  test('a network change during Sign waits for it: the requests get their results', async () => {
    await startBatch()
    const outcome = await joined(sendTransactionRequest({ from: smart, ...transfer }))

    const signing = sign()
    network.set({ network: { rpcUrl: OFF }, onboarded: true })
    expect(await signing).toEqual({ ok: true })
    expect((await responseOf(outcome)).result).toMatch(/^0x[0-9a-f]{64}$/)
    expect(queueNow()).toBeNull()
  })

  test('a network change declines every request in the batch with 4001', async () => {
    await startBatch()
    const outcome = await joined(sendTransactionRequest({ from: smart, ...transfer }))

    network.set({ network: { rpcUrl: OFF }, onboarded: true })
    expect((await responseOf(outcome)).error).toMatchObject({
      code: 4001,
      message: 'The network changed while the request waited in a batch.',
    })
    expect(queueNow()).toBeNull()
  })

  test('a dApp id already waiting in the batch is 5720', async () => {
    await startBatch()
    const first = await joined(sendCallsRequest(smart, [transfer], { id: 'same' }))
    expect(
      await codeOf(
        handleSend({
          rpcUrl,
          request: sendCallsRequest(smart, [transfer], { id: 'same' }),
        }),
      ),
    ).toMatchObject({ code: 5720 })

    await batchAction({ action: 'discard' })
    expect((await responseOf(first)).error).toMatchObject({ code: 4001 })
  })

  test('a direct send whose id joined the batch during its approval is 5720', async () => {
    await startBatch()
    let first: Waiting | undefined
    const ask = async (request: RpcRequest): Promise<Decision> => {
      // While this one is being approved, a batch with its id joins.
      first = await joined(sendCallsRequest(smart, [transfer], { id: 'same' }))
      return { status: 'approved', request }
    }
    expect(
      await codeOf(
        handleSend({
          rpcUrl,
          request: sendCallsRequest(smart, [transfer], { id: 'same' }),
          ask,
        }),
      ),
    ).toMatchObject({ code: 5720 })
    expect(getRecord(records, rpcUrl, 'same')).toBeUndefined()

    await batchAction({ action: 'discard' })
    expect((await responseOf(first as Waiting)).error).toMatchObject({
      code: 4001,
    })
  })

  test('Sign refuses a batch that changed since the review, and sends nothing', async () => {
    await startBatch()
    const first = sendTransactionRequest({ from: smart, ...transfer })
    const firstOutcome = await joined(first)
    const reviewed = queuedIds()
    // With bypass on, a send joins after the user's last look.
    const late = sendTransactionRequest({ from: smart, to: X, value: '0x2' })
    const lateOutcome = await joined(late)

    const changed = {
      ok: false,
      error: { code: BATCH_CHANGED, message: 'The batch changed. Review it again.' },
    }
    expect(await batchAction({ action: 'sign', reviewed })).toEqual(changed)
    expect(
      await batchAction({ action: 'sign', reviewed: [late.id, first.id] }),
    ).toEqual(changed)
    expect(queuedIds()).toEqual([first.id, late.id])
    expect(await node.getBalance(X)).toBe(0n)

    expect(await sign()).toEqual({ ok: true })
    const hash = (await responseOf(firstOutcome)).result
    expect((await responseOf(lateOutcome)).result).toBe(hash)
    await waitForReceipt(node, hash as Hex)
    expect(await node.getBalance(X)).toBe(3n)
  })

  test('"Start batch" for another network than the active one is refused before connecting to it', async () => {
    expect(
      await batchAction({ action: 'open', rpcUrl: OFF, account: smart }),
    ).toEqual({
      ok: false,
      error: {
        code: -32602,
        message: `Batches are only for the active network, not ${OFF}.`,
      },
    })
    expect(queueNow()).toBeNull()
  })

  test('Sign with no batch open is refused; Discard is a no-op', async () => {
    expect(await sign()).toMatchObject({
      ok: false,
      error: { code: -32602, message: 'No batch is open.' },
    })
    expect(await batchAction({ action: 'discard' })).toEqual({ ok: true })
  })

  describe('worker start', () => {
    const left = (rpcUrl: string, items: QueuedItem[]): BatchQueue => ({
      rpcUrl,
      account: smart,
      items,
      openedAt: 0,
    })
    const item: QueuedItem = {
      requestId: 1,
      origin: SITE,
      method: 'eth_sendTransaction',
      calls: [transfer],
      addedAt: 0,
    }
    /** `pending-requests` as a restarted worker loads it: nothing waits. */
    const restarted = async (name: string) =>
      (await import(`./pending-requests.ts?${name}`)) as typeof import('./pending-requests')

    test('the sweep closes a batch left from before, and keeps nothing alive', async () => {
      batchQueue.set({ queue: left(rpcUrl, [item]) })
      const { dropOrphanedRequests } = await restarted('orphaned')
      const interval = spyOn(globalThis, 'setInterval')
      try {
        await dropOrphanedRequests()
        expect(interval).not.toHaveBeenCalled()
      } finally {
        interval.mockRestore()
      }
      expect(queueNow()).toBeNull()
    })

    test('an empty batch ("Start batch") survives the sweep', async () => {
      const open = left(rpcUrl, [])
      batchQueue.set({ queue: open })
      await (await restarted('empty')).dropOrphanedRequests()
      expect(queueNow()).toBe(open)
    })

    test('a batch left on another network than the active one closes', async () => {
      batchQueue.set({ queue: left(OFF, []) })
      await closeStaleBatch()
      expect(queueNow()).toBeNull()

      const open = left(rpcUrl, [])
      batchQueue.set({ queue: open })
      await closeStaleBatch()
      expect(queueNow()).toBe(open)
    })
  })
})

describe('request ids', () => {
  type Handler = (payload: unknown, meta: unknown) => Promise<RpcResponse>
  let rpcHandler: Handler | undefined
  // The handler tells a page from DevWallet's own screens by the extension's
  // id and url; only those two are needed.
  beforeEach(() => {
    const id = 'abcdefghijklmnopabcdefghijklmnop'
    ;(globalThis as { chrome?: unknown }).chrome = {
      runtime: { id, getURL: (path: string) => `chrome-extension://${id}/${path}` },
    }
  })
  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome
  })
  setupRpcHandler({
    messenger: {
      connection: 'background:inpage',
      reply: (_topic: string, handler: Handler) => {
        rpcHandler = handler
        return () => {}
      },
    } as unknown as Parameters<typeof setupRpcHandler>[0]['messenger'],
  })

  /** A page in tab `tab` sends a transfer with JSON-RPC id 7. */
  function fromPage(tab: number, host: string) {
    if (!rpcHandler) throw new Error('no rpc handler')
    return rpcHandler(
      {
        request: {
          id: 7,
          method: 'eth_sendTransaction',
          params: [{ from: smart, ...transfer }],
        },
        rpcUrl,
      },
      {
        sender: {
          tab: { id: tab, url: `https://${host}/` },
          url: `https://${host}/`,
          origin: `https://${host}`,
          frameId: 0,
        },
      },
    )
  }
  const pendingFrom = (tab: number) =>
    pendingRequests.find((r) => r.sender?.tab?.id === tab) as RpcRequest
  const decide = (request: RpcRequest, status: string) =>
    handlers.get('pendingRequest')?.({ request, status })

  async function bothPending() {
    for (let i = 0; i < 300 && pendingRequests.length < 2; i++) {
      await Bun.sleep(10)
    }
    expect(pendingRequests).toHaveLength(2)
    expect(pendingFrom(1).id).not.toBe(pendingFrom(2).id)
    expect([pendingFrom(1).id, pendingFrom(2).id]).not.toContain(7)
  }

  test('two tabs sending the same id get their own decisions, and their own id back', async () => {
    const a = fromPage(1, 'a.test')
    const b = fromPage(2, 'b.test')
    await bothPending()

    await decide(pendingFrom(2), 'rejected')
    await decide(pendingFrom(1), 'approved')
    const [answerA, answerB] = await Promise.all([a, b])
    const hash = answerA.result as Hex
    expect(answerA).toEqual({ id: 7, jsonrpc: '2.0', result: hash })
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/)
    expect(answerB).toMatchObject({ id: 7, error: { code: 4001 } })
    await waitForReceipt(node, hash)
    expect(await node.getBalance(X)).toBe(1n)
  })

  test('two tabs sending the same id both wait in the batch, and both get the hash', async () => {
    const a = fromPage(1, 'a.test')
    const b = fromPage(2, 'b.test')
    await bothPending()

    await decide(pendingFrom(1), 'batched')
    await decide(pendingFrom(2), 'batched')
    const queue = batchQueue.get().queue
    expect(queue?.items.map((i) => i.origin)).toEqual(['a.test', 'b.test'])
    expect(new Set(queue?.items.map((i) => i.requestId)).size).toBe(2)

    expect(
      await handlers.get('batchQueue')?.({
        action: 'sign',
        reviewed: queue?.items.map((i) => i.requestId),
      }),
    ).toEqual({ ok: true })
    const [answerA, answerB] = await Promise.all([a, b])
    const hash = answerA.result as Hex
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/)
    for (const answer of [answerA, answerB]) {
      expect(answer).toEqual({ id: 7, jsonrpc: '2.0', result: hash })
    }
    await waitForReceipt(node, hash)
    expect(await node.getBalance(X)).toBe(2n)
  })
})

describe('page requests', () => {
  type Handler = (payload: unknown, meta: unknown) => Promise<RpcResponse>
  let rpcHandler: Handler | undefined
  setupRpcHandler({
    messenger: {
      connection: 'background:inpage',
      reply: (_topic: string, handler: Handler) => {
        rpcHandler = handler
        return () => {}
      },
    } as unknown as Parameters<typeof setupRpcHandler>[0]['messenger'],
  })
  beforeEach(() => {
    const id = 'abcdefghijklmnopabcdefghijklmnop'
    ;(globalThis as { chrome?: unknown }).chrome = {
      runtime: { id, getURL: (path: string) => `chrome-extension://${id}/${path}` },
    }
    connectedHosts = new Set(['dapp.test'])
  })
  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome
    connectedHosts = null
  })

  type Sender = Record<string, unknown>
  /** The top frame of a tab on `host`. */
  const top = (host: string): Sender => ({
    tab: { id: 1, url: `https://${host}/` },
    url: `https://${host}/`,
    origin: `https://${host}`,
    frameId: 0,
  })
  /** A frame on `host` inside a tab on `tabHost`. */
  const subframe = (host: string, tabHost: string): Sender => ({
    tab: { id: 1, url: `https://${tabHost}/` },
    url: `https://${host}/frame.html`,
    origin: `https://${host}`,
    frameId: 3,
  })
  function ask(method: string, params: unknown, sender: Sender, url?: string) {
    if (!rpcHandler) throw new Error('no rpc handler')
    return rpcHandler(
      { request: { id: 1, method, params }, rpcUrl: url },
      { sender },
    )
  }

  test("the page's rpcUrl is ignored: the wallet's network answers", async () => {
    expect(
      await ask('eth_chainId', [], top('dapp.test'), 'http://127.0.0.1:1'),
    ).toEqual({ id: 1, jsonrpc: '2.0', result: '0x7a69' })
  })

  test("a subframe is checked against its own host, not its tab's", async () => {
    const permissions = async (sender: Sender) =>
      (await ask('wallet_getPermissions', [], sender)).result
    expect(await permissions(top('dapp.test'))).toHaveLength(1)
    expect(await permissions(subframe('evil.test', 'dapp.test'))).toEqual([])
    expect(
      await ask(
        'personal_sign',
        ['0x68656c6c6f', smart],
        subframe('evil.test', 'dapp.test'),
      ),
    ).toMatchObject({ id: 1, error: { code: 4100 } })
    expect(pendingRequests).toHaveLength(0)
  })

  test("a connected site's own subframe is connected", async () => {
    expect(
      (await ask('wallet_getPermissions', [], subframe('dapp.test', 'x.test')))
        .result,
    ).toHaveLength(1)
  })

  test('www. is the same site as its bare host', async () => {
    expect(
      (await ask('wallet_getPermissions', [], top('www.dapp.test'))).result,
    ).toHaveLength(1)
  })

  describe('with both bypasses on', () => {
    beforeEach(() => {
      settings.bypassSignatureAuth = true
      settings.bypassTransactionAuth = true
    })
    afterEach(() => {
      delete settings.bypassSignatureAuth
      delete settings.bypassTransactionAuth
    })

    const tx = { from: smart, ...transfer }
    const typedData = {
      types: {
        EIP712Domain: [{ name: 'name', type: 'string' }],
        Mail: [{ name: 'note', type: 'string' }],
      },
      domain: { name: 'x' },
      primaryType: 'Mail',
      message: { note: 'hi' },
    }
    /** Every method that signs or sends with an account's key. */
    const keyed: [string, unknown[]][] = [
      ['eth_sendTransaction', [tx]],
      [
        'wallet_sendCalls',
        [{ version: '2.0.0', chainId: '0x7a69', from: smart, calls: [transfer] }],
      ],
      ['eth_sign', [smart, '0x68656c6c6f']],
      ['personal_sign', ['0x68656c6c6f', smart]],
      ['eth_signTypedData', [smart, typedData]],
      ['eth_signTypedData_v3', [smart, typedData]],
      ['eth_signTypedData_v4', [smart, typedData]],
      ['eth_signTransaction', [tx]],
    ]

    test('a site that is not connected gets 4100, and the node never hears of it', async () => {
      const fetches = spyOn(globalThis, 'fetch')
      try {
        for (const [method, params] of keyed) {
          expect(await ask(method, params, top('evil.test'))).toMatchObject({
            id: 1,
            error: { code: 4100 },
          })
        }
        const bodies = fetches.mock.calls.map(([, init]) =>
          String(init?.body ?? ''),
        )
        for (const method of [
          ...keyed.map(([m]) => m),
          'eth_sendRawTransaction',
          'eth_sendUserOperation',
        ]) {
          expect(bodies.filter((b) => b.includes(`"${method}"`))).toEqual([])
        }
      } finally {
        fetches.mockRestore()
      }
      expect(pendingRequests).toHaveLength(0)
      expect(await node.getBalance(X)).toBe(0n)
    })

    test('a sandboxed frame of a connected site is no site: 4100, and it cannot connect', async () => {
      // Its url is the site's, but its origin is opaque.
      const sandboxed = { ...top('dapp.test'), origin: 'null' }
      for (const [method, params] of keyed) {
        expect(await ask(method, params, sandboxed)).toMatchObject({
          error: { code: 4100 },
        })
      }
      expect((await ask('wallet_getPermissions', [], sandboxed)).result).toEqual(
        [],
      )
      settings.bypassConnectAuth = true
      try {
        expect(await ask('eth_requestAccounts', [], sandboxed)).toMatchObject({
          error: { code: 4100 },
        })
      } finally {
        delete settings.bypassConnectAuth
      }
      expect(connectedHosts).toEqual(new Set(['dapp.test']))
      expect(pendingRequests).toHaveLength(0)
    })

    test("a subframe of a connected site isn't connected for them either", async () => {
      for (const [method, params] of keyed) {
        expect(
          await ask(method, params, subframe('evil.test', 'dapp.test')),
        ).toMatchObject({ error: { code: 4100 } })
      }
    })

    test('a connected site still signs and sends, unasked', async () => {
      const signature = await ask(
        'personal_sign',
        ['0x68656c6c6f', smart],
        top('dapp.test'),
      )
      expect(signature.result).toMatch(/^0x[0-9a-f]{130}$/)

      const signed = await ask('eth_signTransaction', [tx], top('dapp.test'))
      expect(signed.result).toMatch(/^0x[0-9a-f]+$/)

      const sent = await ask('eth_sendTransaction', [tx], top('dapp.test'))
      const hash = sent.result as Hex
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/)
      await waitForReceipt(node, hash)
      expect(await node.getBalance(X)).toBe(1n)
      expect(pendingRequests).toHaveLength(0)
    })
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

  test('smartStatus reconciles a network it has not seen yet', async () => {
    expect(await call('smartStatus', { rpcUrl })).toMatchObject({ ok: true })
    expect(await node.getCode(smart)).toBe(delegationCode(KERNEL_V3_3))
  })

  test('smartStatus is the AA status of the last reconcile, without another', async () => {
    await reconcileForRpc(rpcUrl)
    await node.setCode(smart, '0x')
    await Bun.sleep(1050)
    expect(await call('smartStatus', { rpcUrl })).toMatchObject({ ok: true })
    // Past the memo, so a reconcile would have delegated it again.
    expect(await node.getCode(smart)).toBe('0x')
  })

  test('previewSend previews a plain-upgradable batch as smart, but not a transaction', async () => {
    const preview = await call('previewSend', {
      rpcUrl,
      from: upgradable,
      calls: [transfer, transfer],
      atomicRequired: true,
      method: 'wallet_sendCalls',
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

  test('setAccountMode: an unknown action is -32602 and changes nothing', async () => {
    expect(
      await codeOf(
        call('setAccountMode', { rpcUrl, address: smart, action: 'delete' }),
      ),
    ).toMatchObject({ code: -32602 })
    expect(modes.get(modeKey(rpcUrl, smart))).toBeUndefined()
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
