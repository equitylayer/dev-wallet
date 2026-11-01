// Sends: `eth_sendTransaction` and `wallet_sendCalls`, after the approval gate,
// through the smart-account execution core. `smart.ts` keeps the node in step
// with the accounts' modes; `rpc.ts` routes the requests here.
import { getMessenger } from '~/messengers'
import { KERNEL_V3_3 } from '~/smart/constants'
import { type ParsedSendCalls, parseSendCalls } from '~/smart/eip5792'
import { atomicityUnsupported, unauthorizedAccount } from '~/smart/errors'
import { executeCalls, planExecution } from '~/smart/execute'
import { setDelegation } from '~/smart/kernel'
import { atomicStatus } from '~/smart/modes'
import { sendTransactionCall, upgradesBeforeSend } from '~/smart/resolve'
import {
  type WalletCoreDeps,
  findAccount,
  handleWalletRequest,
} from '~/smart/wallet-core'
import type { RpcRequest } from '~/types/rpc'
import { serialPerKey } from '~/utils/serial'
import { accountModesStore } from '~/zustand'

import { declinedError } from './methods'
import type { Decision } from './pending-requests'
import { exclusive, invalidate, reconcileSnapshot } from './smart'

const walletMessenger = getMessenger('background:wallet')

/**
 * One send per rpcUrl at a time, from its fresh reconcile to its last
 * transaction: concurrent sends race for the sponsor's funding nonce
 * ("Couldn't fund the sponsor: nonce too low"). Approvals wait outside it,
 * and previews don't need it. Never nested in `exclusive`, which the
 * reconciles inside it use.
 */
const oneSendAtATime = serialPerKey()

/** Asks the user; absent when bypass is on and nobody is asked. */
type Ask = (request: RpcRequest) => Promise<Decision>

/** The send's result, or a plain request for `rpc.ts` to pass to the node. */
export type SendOutcome = { result: unknown } | { passThrough: RpcRequest }

type Approved = { request: RpcRequest; force: boolean }

function notify(message: string): void {
  // The side panel may be closed, so never wait for an answer.
  walletMessenger.send('notice', { message }).catch(() => {})
}

async function approve(
  request: RpcRequest,
  ask: Ask | undefined,
  options: { upgrade?: boolean } = {},
): Promise<Approved> {
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
  const { from } = tx
  if (typeof from !== 'string') return { passThrough: approved.request }

  return oneSendAtATime(rpcUrl, async () => {
    const { deps } = await reconcileSnapshot(rpcUrl, { fresh: true })
    const account = findAccount(deps.accounts, from)
    // Plain accounts, and addresses the wallet doesn't hold, send as before.
    if (account?.mode !== 'smart') return { passThrough: approved.request }

    try {
      // One call through the execution core, like a one-call batch. The
      // dApp's `gas`, `nonce` and fee fields are ignored: the path picks its
      // own (a user op is sent by the sponsor).
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
  })
}

function parse(deps: WalletCoreDeps, request: RpcRequest): ParsedSendCalls {
  return parseSendCalls(request.params, {
    chainId: deps.chainId,
    activeAccount: deps.activeAccount,
    knownAccounts: deps.accounts.map((a) => a.address),
    records: deps.records,
  })
}

/**
 * Upgrades the plain-upgradable account of an approved batch to Kernel, just
 * before the batch. The batch is planned as the Kernel account first, so one
 * that can't go out (a predicted revert nobody forced, …) throws before
 * anything is written. Nothing happens when the account no longer qualifies:
 * its mode changed during the approval, or the AA contracts are gone.
 */
async function upgradeBeforeBatch(
  rpcUrl: string,
  approved: Approved,
  { notifyUser }: { notifyUser: boolean },
): Promise<void> {
  const { deps, aa } = await reconcileSnapshot(rpcUrl, { fresh: true })
  const batch = parse(deps, approved.request)
  const account = findAccount(deps.accounts, batch.from)
  if (!account) throw unauthorizedAccount(batch.from)
  const stillUpgrades = upgradesBeforeSend({
    method: 'wallet_sendCalls',
    mode: account.mode,
    onchain: account.onchain,
    aaReady: aa.ok,
  })
  if (!stillUpgrades) return

  await planExecution({
    node: deps.node,
    chainId: deps.chainId,
    account: { ...account, mode: 'smart', onchain: { kind: 'kernel' } },
    calls: batch.calls,
    atomicRequired: batch.atomicRequired,
    sponsor: deps.sponsor,
    force: approved.force,
  })

  await exclusive(rpcUrl, async () => {
    await setDelegation(deps.node, account.address, KERNEL_V3_3)
    accountModesStore
      .getState()
      .setMode({ rpcUrl, address: account.address, mode: 'smart' })
  })
  invalidate(rpcUrl)
  if (notifyUser) {
    notify(`Upgraded ${account.address} to a Kernel smart account.`)
  }
}

async function sendCalls(
  rpcUrl: string,
  request: RpcRequest,
  ask: Ask | undefined,
): Promise<unknown> {
  // Check the batch before asking anyone: malformed params, another chain, an
  // unknown sender or atomicity the account can't give fail at once.
  const { deps, aa } = await reconcileSnapshot(rpcUrl)
  const batch = parse(deps, request)
  const account = findAccount(deps.accounts, batch.from)
  if (!account) throw unauthorizedAccount(batch.from)
  const upgrade = upgradesBeforeSend({
    method: request.method,
    mode: account.mode,
    onchain: account.onchain,
    aaReady: aa.ok,
  })
  // As the core would refuse it, but before the approval screen opens. A
  // deployment is left to the core, whose -32602 comes first.
  if (
    !upgrade &&
    batch.atomicRequired &&
    atomicStatus(account.mode, account.onchain) !== 'supported' &&
    batch.calls.every((call) => call.to !== undefined)
  ) {
    throw atomicityUnsupported()
  }

  const approved = await approve(request, ask, { upgrade })
  return oneSendAtATime(rpcUrl, async () => {
    try {
      if (upgrade) await upgradeBeforeBatch(rpcUrl, approved, { notifyUser: !ask })
      const { deps: fresh } = await reconcileSnapshot(rpcUrl, { fresh: true })
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
  })
}

/**
 * `eth_sendTransaction` and `wallet_sendCalls`, after the approval gate (`ask`)
 * when there is one. Every `wallet_sendCalls`, and an `eth_sendTransaction`
 * from a smart account, runs through the execution core, one send per rpcUrl
 * at a time; an `eth_sendTransaction` from any other account is handed back to
 * pass through.
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
