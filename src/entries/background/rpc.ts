import { type Address, numberToHex } from 'viem'
import { type HttpRpcClient, getHttpRpcClient } from 'viem/utils'

import {
  UnauthorizedProviderError,
  UnsupportedProviderMethodError,
} from '~/errors'
import { type Messenger, getMessenger } from '~/messengers'
import { connectEvent } from '~/messengers/page-events'
import { sendPageEvent } from '~/messengers/sendPageEvent'
import type { Schema } from '~/messengers/schema'
import { isPageSender } from '~/messengers/transports/guards'
import type { CallbackOptions } from '~/messengers/transports/types'
import { serializeError } from '~/smart/errors'
import { connectNode, nodeMethod } from '~/smart/node'
import { DEVWALLET_ORIGIN } from '~/smart/queue'
import { withFrom } from '~/smart/transaction-call'
import type { RpcRequest, RpcResponse } from '~/types/rpc'
import { senderHost } from '~/utils/host'
import {
  accountStore,
  networkStore,
  sessionsStore,
  settingsStore,
} from '~/zustand'

import {
  assertEthAccountsRequest,
  declinedError,
  isTransactionMethod,
  needsSession,
  permissionsFor,
  refusedFromPage,
  requestRpcUrl,
  requiresApproval,
  takesFrom,
  withSerializedErrors,
} from './methods'
import { type PlainDecision, requestUserDecision } from './pending-requests'
import {
  reconcileBeforeAnswering,
  showCallsStatus,
  walletRequest,
} from './smart'
import { handleSend } from './smart-sends'

const walletMessenger = getMessenger('background:wallet')

/** How long `eth_accounts` waits for a reconcile before answering anyway. */
const ETH_ACCOUNTS_RECONCILE_MS = 1500

// A page picks its own JSON-RPC ids, so two tabs (or a page on purpose) can
// send the same one; and the pending requests, the decisions and the batch
// queue are all keyed by id. So each request gets an id of the background's
// own, and the page gets its id back. Ids count up from the clock at each
// worker start, so they never meet those of requests an earlier worker
// persisted.
let lastRequestId = Date.now() * 1000

function nextRequestId(): number {
  return ++lastRequestId
}

export function setupRpcHandler({ messenger }: { messenger: Messenger }) {
  // Only extension pages may use the wallet channel: what comes on it comes
  // from DevWallet's own screens.
  const fromWallet = messenger.connection === 'background:wallet'

  messenger.reply('request', withSerializedErrors(async (payload, meta) => {
    const response = await handle(
        { ...payload, request: { ...payload.request, id: nextRequestId() } },
        meta,
    )
    return { ...response, id: payload.request.id }
  }))

  /** Answers a request that carries the background's own id. */
  async function handle(
    payload: Schema['request'][0],
    meta: CallbackOptions,
  ): Promise<RpcResponse> {
    const { request, rpcUrl: rpcUrl_ } = payload
    // Anything that isn't one of our extension pages is a page: a content
    // script in any frame, top or not. Each frame is its own site.
    const isInpage = isPageSender(
        meta.sender,
        chrome.runtime.id,
        chrome.runtime.getURL(''),
    )

    const rpcUrl = requestRpcUrl({
      fromPage: isInpage,
      requested: rpcUrl_,
      current: networkStore.getState().network.rpcUrl,
    })
    const rpcClient = getHttpRpcClient(rpcUrl)

    const { getSession } = sessionsStore.getState()
    // The asking frame's own host, as sessions are stored.
    const host = senderHost(meta.sender)
    // `file://` pages report the opaque origin `'null'`.
    const origin = meta.sender.origin ?? new URL(meta.sender.url || '').origin
    const session = getSession({ host })

    const hasOnboarded = isInpage ? networkStore.getState().onboarded : rpcUrl
    if (!hasOnboarded)
      return {
        id: request.id,
        jsonrpc: '2.0',
        error: {
          code: UnsupportedProviderMethodError.code,
          message: 'DevWallet has not been onboarded.',
        },
      } as RpcResponse

    // A "signable" method needs the user's approval, unless it is bypassed.
    const needsApproval = requiresApproval(
        request.method,
        settingsStore.getState(),
    )
    // Signing or sending with an account's key needs a connected site, bypass
    // or not: the bypass skips asking the user, not authorizing the site.
    if (isInpage && !session && needsSession(request.method))
      return unauthorized(request)

    // The node would sign these unasked and past the smart core, so a page
    // gets them only with transactions bypassed (R49). Checked after the
    // session, so a site that isn't connected learns nothing of the setting.
    if (isInpage && refusedFromPage(request.method, settingsStore.getState()))
      return {
        id: request.id,
        jsonrpc: '2.0',
        error: {
          code: UnsupportedProviderMethodError.code,
          message: `DevWallet doesn't let a page call ${request.method} unless transactions are bypassed.`,
        },
      } as RpcResponse

    // A page's transaction that names no account goes from the active one,
    // the first `eth_accounts` gives, never from the node's default (R50).
    // The request itself carries it: the approval, the batch queue and the
    // pass-through all read it.
    if (isInpage && takesFrom(request.method)) {
      const { network } = networkStore.getState()
      const [account] = accountStore
          .getState()
          .getAccounts({ activeFirst: true, rpcUrl: network.rpcUrl })
      if (!account) return unauthorized(request)
      const params = Array.isArray(request.params) ? request.params : []
      ;(request as { params: unknown[] }).params = [
        withFrom(params[0], account.address),
        ...params.slice(1),
      ]
    }

    // Sends go through the smart-account execution core, which asks for the
    // approval itself; plain `eth_sendTransaction`s come back to pass through.
    // A send that waited in the batch queue comes back with its response.
    if (isTransactionMethod(request.method)) {
      const outcome = await handleSend({
        rpcUrl,
        request,
        // `file://` pages have no host.
        origin: fromWallet ? DEVWALLET_ORIGIN : host || meta.sender.url || '',
        ask: needsApproval
            ? (pending, options) =>
                requestUserDecision({ ...pending, sender: meta.sender }, options)
            : undefined,
      })
      const response =
          'passThrough' in outcome
              ? await execute(rpcUrl, rpcClient, outcome.passThrough)
              : 'response' in outcome
                  ? outcome.response
                  : ({
                    id: request.id,
                    jsonrpc: '2.0',
                    result: outcome.result,
                  } as RpcResponse)
      walletMessenger.send('transactionExecuted', undefined)
      return response
    }

    if (needsApproval) {
      const decision = await requestUserDecision({
        ...request,
        sender: meta.sender,
      })
      if (decision.status !== 'approved')
        return declinedResponse(request, decision.status)

      const { id, method, params } = decision.request
      return execute(rpcUrl, rpcClient, {
        method,
        params,
        id,
      } as RpcRequest)
    }

    // EIP-5792 reads are the wallet's to answer, never the node's.
    if (
        request.method === 'wallet_getCapabilities' ||
        request.method === 'wallet_getCallsStatus'
    )
      return {
        id: request.id,
        jsonrpc: '2.0',
        result: await walletRequest(rpcUrl, request),
      } as RpcResponse
    if (request.method === 'wallet_showCallsStatus')
      return {
        id: request.id,
        jsonrpc: '2.0',
        result: await showCallsStatus(rpcUrl, request.params),
      } as RpcResponse

    if (isInpage) {
      // Connecting the site: shared by `eth_requestAccounts` and
      // `wallet_requestPermissions`, which differ only in what they return.
      const connect = async () => {
        // A frame with no host (an opaque origin) is no site to connect.
        if (!host) return { declined: unauthorized(request) }

        const authorize = () => {
          const { getAccounts } = accountStore.getState()
          const { network } = networkStore.getState()
          const { addSession } = sessionsStore.getState()

          const accounts = getAccounts({
            activeFirst: true,
            rpcUrl: network.rpcUrl,
          })

          const addresses = accounts.map((x) => x.address) as Address[]

          addSession({ session: { host } })
          // The site's pages, in any tab or frame, and no other site's.
          void sendPageEvent(connectEvent(host, numberToHex(network.chainId)))

          return { addresses }
        }

        const { bypassConnectAuth } = settingsStore.getState()
        if (!bypassConnectAuth) {
          // The approval screen renders connection requests by method, so a
          // permissions request is shown as the connection it amounts to.
          const decision = await requestUserDecision({
            ...request,
            method: 'eth_requestAccounts',
            params: undefined,
            sender: meta.sender,
          })
          if (decision.status !== 'approved')
            return { declined: declinedResponse(request, decision.status) }
        }

        // The dApp may read the accounts' code next: match it to their modes.
        await reconcileBeforeAnswering(rpcUrl)
        return authorize()
      }

      if (request.method === 'eth_requestAccounts') {
        const connection = await connect()
        if ('declined' in connection) return connection.declined

        return {
          id: request.id,
          jsonrpc: '2.0',
          result: connection.addresses,
        } as RpcResponse
      }

      if (request.method === 'wallet_requestPermissions') {
        assertEthAccountsRequest(request.params)

        const connection = await connect()
        if ('declined' in connection) return connection.declined

        return {
          id: request.id,
          jsonrpc: '2.0',
          result: permissionsFor(origin, true),
        } as RpcResponse
      }

      if (request.method === 'wallet_getPermissions') {
        return {
          id: request.id,
          jsonrpc: '2.0',
          result: permissionsFor(origin, !!session),
        } as RpcResponse
      }

      if (request.method === 'eth_accounts') {
        // dApps poll this, so a slow node only holds the answer so long.
        if (session)
          await reconcileBeforeAnswering(rpcUrl, {
            timeoutMs: ETH_ACCOUNTS_RECONCILE_MS,
          })
        const { getAccounts } = accountStore.getState()
        const { network } = networkStore.getState()

        const accounts = getAccounts({
          activeFirst: true,
          rpcUrl: network.rpcUrl,
        })
        const addresses = session
            ? (accounts.map((x) => x.address) as Address[])
            : []

        return {
          id: request.id,
          jsonrpc: '2.0',
          result: addresses,
        } as RpcResponse
      }
    }

    return execute(rpcUrl, rpcClient, request)
  }
}

function unauthorized(request: RpcRequest) {
  return {
    id: request.id,
    jsonrpc: '2.0',
    error: {
      code: UnauthorizedProviderError.code,
      message:
        'The requested account and/or method has not been authorized by the user.',
    },
  } as RpcResponse
}

function declinedResponse(
    request: RpcRequest,
    status: Exclude<PlainDecision['status'], 'approved'>,
) {
  return {
    id: request.id,
    jsonrpc: '2.0',
    error: serializeError(declinedError(request, status)),
  } satisfies RpcResponse
}

async function execute(
  rpcUrl: string,
  rpcClient: HttpRpcClient,
  request: RpcRequest,
) {
  // Anvil doesn't support `personal_sign` – use `eth_sign` instead.
  if (request.method === 'personal_sign') {
    request.method = 'eth_sign' as any
    request.params = [request.params[1], request.params[0]]
  }

  // Hardhat exposes the Anvil cheat methods under `hardhat_*`.
  const { kind } = await connectNode({ rpcUrl })
  return (await rpcClient.request({
    body: { ...request, method: nodeMethod(kind, request.method) },
  })) as unknown as RpcResponse
}
