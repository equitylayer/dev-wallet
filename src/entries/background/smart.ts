// The background's glue to the chrome-free smart-account core (`~/smart`): it
// reads the stores, keeps the node in step with the accounts' modes, and runs
// sends, previews and mode changes. `rpc.ts` routes requests here.
import { type Address, zeroAddress } from 'viem'

import { getMessenger } from '~/messengers'
import type { Schema } from '~/messengers/schema'
import { KERNEL_V3_3 } from '~/smart/constants'
import { parseSendCalls } from '~/smart/eip5792'
import {
  INVALID_PARAMS,
  WalletRpcError,
  unauthorizedAccount,
  unknownBundleId,
} from '~/smart/errors'
import { executeCalls } from '~/smart/execute'
import { classifyCode, setDelegation } from '~/smart/kernel'
import type { ReconcileResult } from '~/smart/modes'
import { connectNode } from '~/smart/node'
import { type SendPreview, previewCalls } from '~/smart/preview'
import {
  reconcileNetwork,
  sendTransactionCall,
  upgradesBeforeSend,
} from '~/smart/resolve'
import type { AaStatus } from '~/smart/setup'
import {
  type WalletCoreDeps,
  findAccount,
  handleWalletRequest,
} from '~/smart/wallet-core'
import type { RpcRequest } from '~/types/rpc'
import { filterAccounts } from '~/utils/accounts'
import {
  accountModesStore,
  accountStore,
  batchCallsStore,
  settingsStore,
} from '~/zustand'

import { declinedError } from './methods'
import type { Decision } from './pending-requests'

export { detectReset, resolveAccount } from '~/smart/resolve'

const walletMessenger = getMessenger('background:wallet')

const RECONCILE_TTL_MS = 1000

type Snapshot = {
  deps: WalletCoreDeps
  aa: AaStatus
  results: ReconcileResult[]
}

const snapshots = new Map<string, { at: number; snapshot: Promise<Snapshot> }>()
const lastBlock = new Map<string, bigint>()
const queues = new Map<string, Promise<unknown>>()

/**
 * Runs `task` once every earlier one for `rpcUrl` has settled, so reconciles
 * and mode changes never interleave their reads and writes on the node.
 */
function exclusive<T>(rpcUrl: string, task: () => Promise<T>): Promise<T> {
  const run = (queues.get(rpcUrl) ?? Promise.resolve())
    .catch(() => {})
    .then(task)
  queues.set(rpcUrl, run)
  return run
}

type Persisted = {
  persist: {
    hasHydrated(): boolean
    onFinishHydration(listener: () => void): () => void
  }
}

function hydrated(store: Persisted): Promise<void> {
  if (store.persist.hasHydrated()) return Promise.resolve()
  return new Promise((resolve) => {
    const unsubscribe = store.persist.onFinishHydration(() => {
      unsubscribe()
      resolve()
    })
  })
}

// A woken service worker must not mistake "not loaded yet" for "no stored
// mode": the default would then be written on chain.
function storesHydrated() {
  return Promise.all(
    [accountStore, accountModesStore, settingsStore, batchCallsStore].map(
      hydrated,
    ),
  )
}

async function computeSnapshot(rpcUrl: string): Promise<Snapshot> {
  await storesHydrated()
  const node = await connectNode({ rpcUrl })
  const { account, accounts } = accountStore.getState()
  const visible = filterAccounts({
    account,
    accounts,
    activeFirst: true,
    rpcUrl,
  })
  const { getMode } = accountModesStore.getState()

  const [chainId, state] = await Promise.all([
    node.chainId(),
    reconcileNetwork(node, {
      lastBlock: lastBlock.get(rpcUrl),
      accounts: visible.map(({ address, impersonate }) => ({
        address,
        impersonated: impersonate === true,
        stored: getMode({ rpcUrl, address }),
      })),
    }),
  ])
  // A reset node has none of the batches recorded before.
  if (state.reset) batchCallsStore.getState().clearRecords(rpcUrl)
  lastBlock.set(rpcUrl, state.blockNumber)

  return {
    aa: state.aa,
    results: state.accounts.map(({ canSign: _, ...result }) => result),
    deps: {
      node,
      rpcUrl,
      chainId,
      // What `eth_accounts` lists first.
      activeAccount: visible[0]?.address ?? zeroAddress,
      accounts: state.accounts.map(({ address, mode, onchain, canSign }) => ({
        address,
        mode,
        onchain,
        canSign,
      })),
      sponsor: settingsStore.getState().sponsor,
      records: {
        get: (id) => batchCallsStore.getState().getRecord(rpcUrl, id),
        put: (record) => batchCallsStore.getState().putRecord(record),
      },
    },
  }
}

/** The latest reconcile of `rpcUrl`, reused for `RECONCILE_TTL_MS`. */
function snapshotFor(rpcUrl: string): Promise<Snapshot> {
  const memo = snapshots.get(rpcUrl)
  if (memo && Date.now() - memo.at < RECONCILE_TTL_MS) return memo.snapshot

  const entry = {
    at: Date.now(),
    snapshot: exclusive(rpcUrl, () => computeSnapshot(rpcUrl)),
  }
  snapshots.set(rpcUrl, entry)
  // A failure isn't remembered: the next call tries again.
  entry.snapshot.catch(() => {
    if (snapshots.get(rpcUrl) === entry) snapshots.delete(rpcUrl)
  })
  return entry.snapshot
}

function invalidate(rpcUrl: string): void {
  snapshots.delete(rpcUrl)
}

/**
 * Reconciles the network's accounts with the node (installing the AA
 * contracts, delegating smart accounts, clearing records after a reset) and
 * returns what the execution core needs. Memoized per rpcUrl for 1 s; sends
 * and mode changes start over.
 *
 * @throws The node's error when the reconcile fails; nothing is memoized.
 */
export async function reconcileForRpc(rpcUrl: string): Promise<WalletCoreDeps> {
  const { deps } = await snapshotFor(rpcUrl)
  return { ...deps, sponsor: settingsStore.getState().sponsor }
}

async function freshDeps(rpcUrl: string): Promise<WalletCoreDeps> {
  invalidate(rpcUrl)
  return reconcileForRpc(rpcUrl)
}

/**
 * Reconciles before a dApp is told its accounts, so their code matches their
 * modes when it reads it. A failure is only logged: the addresses don't
 * depend on it, and the next request retries.
 */
export async function reconcileBeforeAnswering(rpcUrl: string): Promise<void> {
  try {
    await snapshotFor(rpcUrl)
  } catch (error) {
    console.warn('DevWallet could not reconcile accounts with the node', error)
  }
}

function notify(message: string): void {
  // The side panel may be closed, so never wait for an answer.
  walletMessenger.send('notice', { message }).catch(() => {})
}

////////////////////////////////////////////////////////////////////////
// Sends

/** Asks the user; absent when bypass is on and nobody is asked. */
type Ask = (request: RpcRequest) => Promise<Decision>

/** The send's result, or a plain request for `rpc.ts` to pass to the node. */
export type SendOutcome = { result: unknown } | { passThrough: RpcRequest }

async function approve(
  request: RpcRequest,
  ask: Ask | undefined,
  options: { upgrade?: boolean } = {},
): Promise<{ request: RpcRequest; force: boolean }> {
  // Nobody is asked, so nobody can say "Sign anyway": a predicted revert is
  // refused with code 3 (spec §4).
  if (!ask) return { request, force: false }
  const decision = await ask(request)
  if (decision.status !== 'approved') {
    throw declinedError(request, decision.status, options)
  }
  const { id, method, params } = decision.request
  return {
    request: { id, method, params } as RpcRequest,
    force: decision.force === true,
  }
}

async function upgradeAccount(rpcUrl: string, address: Address) {
  const node = await connectNode({ rpcUrl })
  await exclusive(rpcUrl, async () => {
    await setDelegation(node, address, KERNEL_V3_3)
    accountModesStore.getState().setMode({ rpcUrl, address, mode: 'smart' })
  })
  invalidate(rpcUrl)
}

function firstParam(request: RpcRequest): Record<string, unknown> {
  const [param] = (request.params ?? []) as unknown[]
  return typeof param === 'object' && param !== null
    ? (param as Record<string, unknown>)
    : {}
}

async function sendTransaction(
  rpcUrl: string,
  request: RpcRequest,
  ask: Ask | undefined,
): Promise<SendOutcome> {
  const approved = await approve(request, ask)
  // The approval screen sends back the transaction it showed, maybe edited;
  // anything it left out keeps the dApp's value.
  const tx = { ...firstParam(request), ...firstParam(approved.request) }
  const deps = typeof tx.from === 'string' ? await freshDeps(rpcUrl) : null
  const account = deps && findAccount(deps.accounts, tx.from as string)
  // Plain accounts, and addresses the wallet doesn't hold, send as before.
  if (!deps || account?.mode !== 'smart') {
    return { passThrough: approved.request }
  }

  try {
    // One call through the execution core, like a one-call batch. The dApp's
    // `gas`, `nonce` and fee fields are ignored: the path picks its own (a
    // user op is sent by the sponsor).
    const { transactionHashes } = await executeCalls({
      node: deps.node,
      chainId: deps.chainId,
      account,
      calls: [sendTransactionCall(tx)],
      atomicRequired: false,
      sponsor: deps.sponsor,
      force: approved.force,
    })
    // For a user op, the `handleOps` transaction that carried it.
    return { result: transactionHashes[0] }
  } finally {
    invalidate(rpcUrl)
  }
}

async function sendCalls(
  rpcUrl: string,
  request: RpcRequest,
  ask: Ask | undefined,
): Promise<unknown> {
  // Check the batch before asking anyone: malformed params, another chain or
  // an unknown sender fail at once.
  const { deps, aa } = await snapshotFor(rpcUrl)
  const { from } = parseSendCalls(request.params, {
    chainId: deps.chainId,
    activeAccount: deps.activeAccount,
    knownAccounts: deps.accounts.map((a) => a.address),
    records: deps.records,
  })
  const account = findAccount(deps.accounts, from)
  if (!account) throw unauthorizedAccount(from)
  const upgrade = upgradesBeforeSend({
    method: request.method,
    mode: account.mode,
    onchain: account.onchain,
    aaReady: aa.ok,
  })

  const approved = await approve(request, ask, { upgrade })
  if (upgrade) {
    await upgradeAccount(rpcUrl, account.address)
    if (!ask) notify(`Upgraded ${account.address} to a Kernel smart account.`)
  }

  try {
    const fresh = await freshDeps(rpcUrl)
    return await handleWalletRequest(
      { ...fresh, force: approved.force },
      {
        method: 'wallet_sendCalls',
        params: approved.request.params as unknown[],
      },
    )
  } finally {
    invalidate(rpcUrl)
  }
}

/**
 * `eth_sendTransaction` and `wallet_sendCalls`, after the approval gate (`ask`)
 * when there is one. Every `wallet_sendCalls`, and an `eth_sendTransaction`
 * from a smart account, runs through the execution core; an
 * `eth_sendTransaction` from any other account is handed back to pass through.
 */
export async function handleSend(args: {
  rpcUrl: string
  request: RpcRequest
  ask?: Ask
}): Promise<SendOutcome> {
  const { rpcUrl, request, ask } = args
  if (request.method === 'wallet_sendCalls') {
    return { result: await sendCalls(rpcUrl, request, ask) }
  }
  return sendTransaction(rpcUrl, request, ask)
}

////////////////////////////////////////////////////////////////////////
// EIP-5792 reads

/** `wallet_getCapabilities` and `wallet_getCallsStatus`. */
export async function walletRequest(
  rpcUrl: string,
  request: { method: string; params?: unknown },
): Promise<unknown> {
  return handleWalletRequest(await reconcileForRpc(rpcUrl), {
    method: request.method,
    params: request.params as unknown[] | undefined,
  })
}

/** `wallet_showCallsStatus`: opens the batch's first transaction. */
export async function showCallsStatus(
  rpcUrl: string,
  params: unknown,
): Promise<null> {
  const [id] = Array.isArray(params) ? params : []
  if (typeof id !== 'string') {
    throw new WalletRpcError(INVALID_PARAMS, 'Expected a batch id')
  }
  await hydrated(batchCallsStore)
  const record = batchCallsStore.getState().getRecord(rpcUrl, id)
  if (!record) throw unknownBundleId(id)
  walletMessenger
    .send('pushRoute', `/transaction/${record.transactionHashes[0]}`)
    .catch(() => {})
  return null
}

////////////////////////////////////////////////////////////////////////
// Wallet UI messages

async function previewSend({
  rpcUrl,
  from,
  calls,
  atomicRequired,
  method = 'wallet_sendCalls',
}: Schema['previewSend'][0]): Promise<SendPreview> {
  const { deps, aa } = await snapshotFor(rpcUrl)
  const account = findAccount(deps.accounts, from)
  if (!account) throw unauthorizedAccount(from)
  return previewCalls(
    { ...deps, sponsor: settingsStore.getState().sponsor },
    {
      account,
      calls,
      atomicRequired,
      asSmart: upgradesBeforeSend({
        method,
        mode: account.mode,
        onchain: account.onchain,
        aaReady: aa.ok,
      }),
    },
  )
}

async function setAccountMode({
  rpcUrl,
  address: requested,
  action,
}: Schema['setAccountMode'][0]): Promise<ReconcileResult> {
  const { deps, aa } = await snapshotFor(rpcUrl)
  const address = findAccount(deps.accounts, requested)?.address
  if (!address) throw unauthorizedAccount(requested)
  const { node } = deps
  const { setMode } = accountModesStore.getState()

  const wrote = await exclusive(rpcUrl, async () => {
    const onchain = classifyCode(await node.getCode(address))
    if (action === 'switch-to-kernel') {
      if (onchain.kind === 'contract') {
        throw new Error(
          `${address} holds contract code; DevWallet won't overwrite it.`,
        )
      }
      if (!aa.ok) {
        const conflicts = aa.conflicts.join(', ')
        throw new Error(
          `Smart accounts are off on this network: unknown code at ${conflicts}.`,
        )
      }
      await setDelegation(node, address, KERNEL_V3_3)
      setMode({ rpcUrl, address, mode: 'smart' })
      return onchain.kind !== 'kernel'
    }
    if (action === 'revoke') {
      setMode({ rpcUrl, address, mode: 'plain-upgradable' })
      // A contract's own code is never cleared.
      const delegated = onchain.kind === 'kernel' || onchain.kind === 'delegated'
      if (delegated) await setDelegation(node, address, null)
      return delegated
    }
    setMode({ rpcUrl, address, mode: action })
    return false
  })

  invalidate(rpcUrl)
  const { results } = await snapshotFor(rpcUrl)
  const result = results.find(
    (r) => r.address.toLowerCase() === address.toLowerCase(),
  )
  if (!result) throw unauthorizedAccount(address)
  return { ...result, changed: result.changed || wrote }
}

export function setupSmartHandlers() {
  walletMessenger.reply('previewSend', previewSend)
  walletMessenger.reply('setAccountMode', setAccountMode)
  walletMessenger.reply(
    'smartStatus',
    async ({ rpcUrl }) => (await snapshotFor(rpcUrl)).aa,
  )
}
