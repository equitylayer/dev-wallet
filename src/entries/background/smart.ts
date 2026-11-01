// The background's glue to the chrome-free smart-account core (`~/smart`): it
// reads the stores, keeps the node in step with the accounts' modes, and
// answers the EIP-5792 reads, previews and mode changes. Sends are in
// `smart-sends.ts`; `rpc.ts` routes requests to both.
import { zeroAddress } from 'viem'

import { getMessenger } from '~/messengers'
import type { Schema } from '~/messengers/schema'
import { KERNEL_V3_3 } from '~/smart/constants'
import {
  INVALID_PARAMS,
  WalletRpcError,
  unauthorizedAccount,
  unknownBundleId,
} from '~/smart/errors'
import { classifyCode, setDelegation } from '~/smart/kernel'
import type { ReconcileResult } from '~/smart/modes'
import { connectNode } from '~/smart/node'
import { type SendPreview, previewCalls } from '~/smart/preview'
import {
  isAccountModeAction,
  reconcileNetwork,
  upgradesBeforeSend,
} from '~/smart/resolve'
import type { AaStatus } from '~/smart/setup'
import {
  type WalletCoreDeps,
  findAccount,
  handleWalletRequest,
} from '~/smart/wallet-core'
import { defaultAccount, filterAccounts } from '~/utils/accounts'
import { serialPerKey } from '~/utils/serial'
import {
  accountModesStore,
  accountStore,
  batchCallsStore,
  settingsStore,
} from '~/zustand'

export { detectReset, resolveAccount } from '~/smart/resolve'

const walletMessenger = getMessenger('background:wallet')

const RECONCILE_TTL_MS = 1000

export type Snapshot = {
  deps: WalletCoreDeps
  aa: AaStatus
  results: ReconcileResult[]
}

const snapshots = new Map<string, { at: number; snapshot: Promise<Snapshot> }>()
const lastBlock = new Map<string, bigint>()
/** Each network's AA status as of its last reconcile, for `smartStatus`. */
const lastAa = new Map<string, AaStatus>()

/**
 * Runs a task for an rpcUrl once every earlier one has settled, so reconciles
 * and mode changes never interleave their reads and writes on the node.
 */
export const exclusive = serialPerKey()

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
  lastAa.set(rpcUrl, state.aa)

  return {
    aa: state.aa,
    results: state.accounts.map(({ canSign: _, ...result }) => result),
    deps: {
      node,
      rpcUrl,
      chainId,
      // What `eth_accounts` lists first (`defaultAccount`), as the approval
      // screen shows it.
      activeAccount:
        defaultAccount({ account, accounts, rpcUrl })?.address ?? zeroAddress,
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

/** Drops the memo, so the next reconcile of `rpcUrl` reads the node again. */
export function invalidate(rpcUrl: string): void {
  snapshots.delete(rpcUrl)
}

/**
 * Reconciles the network's accounts with the node (installing the AA
 * contracts, delegating smart accounts, clearing records after a reset).
 * Memoized per rpcUrl for 1 s; `fresh` starts over. The sponsor is read live.
 *
 * @throws The node's error when the reconcile fails; nothing is memoized.
 */
export async function reconcileSnapshot(
  rpcUrl: string,
  { fresh = false }: { fresh?: boolean } = {},
): Promise<Snapshot> {
  if (fresh) invalidate(rpcUrl)
  const snapshot = await snapshotFor(rpcUrl)
  return {
    ...snapshot,
    deps: { ...snapshot.deps, sponsor: settingsStore.getState().sponsor },
  }
}

/** What the execution core needs, after a reconcile (see `reconcileSnapshot`). */
export async function reconcileForRpc(rpcUrl: string): Promise<WalletCoreDeps> {
  return (await reconcileSnapshot(rpcUrl)).deps
}

/**
 * Reconciles before a dApp is told its accounts, so their code matches their
 * modes when it reads it. A failure is only logged: the addresses don't
 * depend on it, and the next request retries. With `timeoutMs`, a slow node
 * is waited for that long only; the reconcile carries on in the background.
 */
export async function reconcileBeforeAnswering(
  rpcUrl: string,
  { timeoutMs }: { timeoutMs?: number } = {},
): Promise<void> {
  const reconcile = snapshotFor(rpcUrl).then(
    () => {},
    (error) => {
      console.warn('DevWallet could not reconcile accounts with the node', error)
    },
  )
  if (timeoutMs === undefined) return reconcile

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs)
  })
  await Promise.race([reconcile, timeout])
  clearTimeout(timer)
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
  method,
}: Schema['previewSend'][0]): Promise<SendPreview> {
  const { deps, aa } = await reconcileSnapshot(rpcUrl)
  const account = findAccount(deps.accounts, from)
  if (!account) throw unauthorizedAccount(from)
  return previewCalls(
    deps,
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
  if (!isAccountModeAction(action)) {
    throw new WalletRpcError(
      INVALID_PARAMS,
      `Unknown account mode action ${JSON.stringify(action)}`,
    )
  }
  const { deps, aa } = await reconcileSnapshot(rpcUrl)
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

  const { results } = await reconcileSnapshot(rpcUrl, { fresh: true })
  const result = results.find(
    (r) => r.address.toLowerCase() === address.toLowerCase(),
  )
  if (!result) throw unauthorizedAccount(address)
  return { ...result, changed: result.changed || wrote }
}

export function setupSmartHandlers() {
  walletMessenger.reply('previewSend', previewSend)
  walletMessenger.reply('setAccountMode', setAccountMode)
  // The status of the last reconcile; only a network never reconciled is
  // reconciled now.
  walletMessenger.reply(
    'smartStatus',
    async ({ rpcUrl }) =>
      lastAa.get(rpcUrl) ?? (await reconcileSnapshot(rpcUrl)).aa,
  )
}
