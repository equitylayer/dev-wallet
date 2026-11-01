// Sends: `eth_sendTransaction` and `wallet_sendCalls`, after the approval gate,
// through the smart-account execution core, or into the open batch queue
// (`batch-queue-join.ts`). `smart.ts` keeps the node in step with the accounts'
// modes; `rpc.ts` routes the requests here.
import { getMessenger } from '~/messengers'
import { KERNEL_V3_3 } from '~/smart/constants'
import { atomicityUnsupported, unauthorizedAccount } from '~/smart/errors'
import { executeCalls, planExecution } from '~/smart/execute'
import { setDelegation } from '~/smart/kernel'
import { atomicStatus } from '~/smart/modes'
import {
  assertSmartSendable,
  dropsExtras,
  refusedOnSmartPath,
  sendTransactionCall,
  upgradesBeforeSend,
} from '~/smart/resolve'
import { findAccount, handleWalletRequest } from '~/smart/wallet-core'
import type { RpcRequest, RpcResponse } from '~/types/rpc'
import { accountModesStore } from '~/zustand'

import { addToBatch, joinUnasked, openBatch } from './batch-queue-join'
import { declinedError } from './methods'
import type { Batcher, Decision, Joined } from './pending-requests'
import {
  type IncomingSend,
  firstParam,
  oneSendAtATime,
  parseBatch,
} from './send-shared'
import { exclusive, invalidate, reconcileSnapshot } from './smart'

const walletMessenger = getMessenger('background:wallet')

/**
 * Asks the user; absent when bypass is on and nobody is asked. "Add to batch"
 * calls `batch`.
 */
type Ask = (
  request: RpcRequest,
  options: { batch: Batcher },
) => Promise<Decision>

/**
 * The send's result; the response of a request that waited in the batch
 * queue; or a plain request for `rpc.ts` to pass to the node.
 */
export type SendOutcome =
  | { result: unknown }
  | { response: RpcResponse }
  | { passThrough: RpcRequest }

type Approved = { request: RpcRequest; force: boolean }

function notify(message: string): void {
  // The side panel may be closed, so never wait for an answer.
  walletMessenger.send('notice', { message }).catch(() => {})
}

async function approve(
  send: IncomingSend,
  ask: Ask | undefined,
  { upgrade = false }: { upgrade?: boolean } = {},
): Promise<Approved | Joined> {
  const { request } = send
  // Nobody is asked, so nobody can say "Sign anyway": a predicted revert is
  // refused with code 3 (spec §4).
  if (!ask) return { request, force: false }
  const decision = await ask(request, {
    batch: (pending) => addToBatch(send, pending),
  })
  if (decision.status === 'batched') return decision
  if (decision.status !== 'approved') {
    throw declinedError(request, decision.status, { upgrade })
  }
  const { id, method, params } = decision.request
  return {
    request: { id, method, params } as RpcRequest,
    force: decision.force === true,
  }
}

/** A request that joined the batch queue answers once the batch is done. */
async function answered(sent: SendOutcome | Joined): Promise<SendOutcome> {
  return 'queued' in sent ? { response: await sent.queued } : sent
}

/**
 * Refuses, before anyone is asked, a smart account's transaction that carries
 * what the core can't send (R54). Only such a transaction costs a reconcile
 * here; the send checks again with the account's mode then (`sendTransaction`).
 */
async function refuseUnsendable(
  rpcUrl: string,
  tx: Record<string, unknown>,
): Promise<void> {
  if (typeof tx.from !== 'string' || !refusedOnSmartPath(tx)) return
  const { deps } = await reconcileSnapshot(rpcUrl)
  const account = findAccount(deps.accounts, tx.from)
  if (account && dropsExtras(tx, account.mode)) assertSmartSendable(tx)
}

async function sendTransaction(
  send: IncomingSend,
  ask: Ask | undefined,
): Promise<SendOutcome> {
  const { rpcUrl, request } = send
  await refuseUnsendable(rpcUrl, firstParam(request))
  const approved = await approve(send, ask)
  if ('queued' in approved) return answered(approved)
  // The approval screen sends back the transaction it showed, maybe edited;
  // anything it left out keeps the dApp's value.
  const tx = { ...firstParam(request), ...firstParam(approved.request) }
  const { from } = tx
  // Without a string `from`, the node gets it whole (`dropsExtras`).
  if (typeof from !== 'string') return { passThrough: approved.request }

  const sent = await oneSendAtATime(rpcUrl, async () => {
    if (!ask) {
      const joined = await joinUnasked(send, approved.request)
      if (joined) return joined
    }
    const { deps } = await reconcileSnapshot(rpcUrl, { fresh: true })
    const account = findAccount(deps.accounts, from)
    // Plain accounts, and addresses the wallet doesn't hold, send as before.
    // The approval shows the extra fields as dropped by this same rule.
    if (!account || !dropsExtras(tx, account.mode))
      return { passThrough: approved.request }
    // It drops the type, access list, gas, fees and nonce, but never an
    // authorization list or blobs (R54): the mode may have changed since.
    assertSmartSendable(tx)

    try {
      // One call through the execution core, like a one-call batch. The
      // dApp's `gas`, `nonce` and fee fields are ignored: the path picks its
      // own (a user op is sent by the sponsor). So are its type and access
      // list.
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
  return answered(sent)
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
  const batch = parseBatch(deps, approved.request)
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
  send: IncomingSend,
  ask: Ask | undefined,
): Promise<SendOutcome> {
  const { rpcUrl, request } = send
  // Check the batch before asking anyone: malformed params, another chain, an
  // unknown sender, a duplicate id or atomicity the account can't give fail
  // at once.
  const { deps, aa } = await reconcileSnapshot(rpcUrl)
  await openBatch()
  const batch = parseBatch(deps, request)
  const account = findAccount(deps.accounts, batch.from)
  if (!account) throw unauthorizedAccount(batch.from)
  const upgrade = upgradesBeforeSend({
    method: request.method,
    mode: account.mode,
    onchain: account.onchain,
    aaReady: aa.ok,
  })
  // As the core would refuse it, but before the approval screen opens.
  // (`parseBatch` already refused a deployment.)
  if (
    !upgrade &&
    batch.atomicRequired &&
    atomicStatus(account.mode, account.onchain) !== 'supported'
  ) {
    throw atomicityUnsupported()
  }

  const approved = await approve(send, ask, { upgrade })
  if ('queued' in approved) return answered(approved)
  const sent = await oneSendAtATime(rpcUrl, async () => {
    try {
      if (!ask) {
        const joined = await joinUnasked(send, approved.request)
        if (joined) return joined
      }
      // A batch with this id may have joined the queue while this one waited
      // for approval: 5720, before anything is written.
      parseBatch((await reconcileSnapshot(rpcUrl)).deps, approved.request)
      if (upgrade) await upgradeBeforeBatch(rpcUrl, approved, { notifyUser: !ask })
      const { deps: fresh } = await reconcileSnapshot(rpcUrl, { fresh: true })
      return {
        result: await handleWalletRequest(
          { ...fresh, force: approved.force },
          {
            method: 'wallet_sendCalls',
            params: approved.request.params as unknown[],
          },
        ),
      }
    } finally {
      invalidate(rpcUrl)
    }
  })
  return answered(sent)
}

/**
 * `eth_sendTransaction` and `wallet_sendCalls`, after the approval gate (`ask`)
 * when there is one. Every `wallet_sendCalls`, and an `eth_sendTransaction`
 * from a smart account, runs through the execution core, one send per rpcUrl
 * at a time; an `eth_sendTransaction` from any other account is handed back to
 * pass through.
 *
 * While a batch is open, a send from its account on its network joins it:
 * unasked when bypass is on, otherwise when the user picks "Add to batch"
 * (which opens a batch when none is open). It then waits there, and answers
 * with the batch's outcome.
 */
export async function handleSend(
  args: IncomingSend & { ask?: Ask },
): Promise<SendOutcome> {
  const { ask, ...send } = args
  if (send.request.method === 'wallet_sendCalls') return sendCalls(send, ask)
  return sendTransaction(send, ask)
}
