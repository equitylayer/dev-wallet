import { type Address, numberToHex } from 'viem'
import { type HttpRpcClient, getHttpRpcClient } from 'viem/utils'

import {
  UnauthorizedProviderError,
  UnsupportedProviderMethodError,
} from '~/errors'
import { type Messenger, getMessenger } from '~/messengers'
import { serializeError } from '~/smart/errors'
import { connectNode, nodeMethod } from '~/smart/node'
import type { RpcRequest, RpcResponse } from '~/types/rpc'
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
  permissionsFor,
  requiresApproval,
  withSerializedErrors,
} from './methods'
import { type Decision, requestUserDecision } from './pending-requests'
import {
  reconcileBeforeAnswering,
  showCallsStatus,
  walletRequest,
} from './smart'
import { handleSend } from './smart-sends'

const inpageMessenger = getMessenger('background:inpage')
const walletMessenger = getMessenger('background:wallet')

/** How long `eth_accounts` waits for a reconcile before answering anyway. */
const ETH_ACCOUNTS_RECONCILE_MS = 1500

export function setupRpcHandler({ messenger }: { messenger: Messenger }) {
  messenger.reply('request', withSerializedErrors(async (payload, meta) => {
    const { request, rpcUrl: rpcUrl_ } = payload
    const isInpage =
        meta.sender.tab &&
        !meta.sender.tab?.url?.includes('extension://') &&
        (!meta.sender.frameId || meta.sender.frameId === 0)

    const rpcUrl = rpcUrl_ || networkStore.getState().network.rpcUrl
    const rpcClient = getHttpRpcClient(rpcUrl)

    const { getSession } = sessionsStore.getState()
    const host = new URL(meta.sender.url || '').host
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
    if (needsApproval && isInpage && !session)
      return {
        id: request.id,
        jsonrpc: '2.0',
        error: {
          code: UnauthorizedProviderError.code,
          message:
            'The requested account and/or method has not been authorized by the user.',
        },
      } as RpcResponse

    // Sends go through the smart-account execution core, which asks for the
    // approval itself; plain `eth_sendTransaction`s come back to pass through.
    if (isTransactionMethod(request.method)) {
      const outcome = await handleSend({
        rpcUrl,
        request,
        ask: needsApproval
            ? (pending) =>
                requestUserDecision({ ...pending, sender: meta.sender })
            : undefined,
      })
      const response =
          'passThrough' in outcome
              ? await execute(rpcUrl, rpcClient, outcome.passThrough)
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
        const authorize = () => {
          const { getAccounts } = accountStore.getState()
          const { network } = networkStore.getState()
          const { addSession } = sessionsStore.getState()

          const accounts = getAccounts({
            activeFirst: true,
            rpcUrl: network.rpcUrl,
          })

          const host = new URL(meta.sender.url || '').host.replace('www.', '')
          const addresses = accounts.map((x) => x.address) as Address[]

          addSession({ session: { host } })
          inpageMessenger.send('connect', {
            chainId: numberToHex(network.chainId),
          })

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
  }))
}

function declinedResponse(
    request: RpcRequest,
    status: Exclude<Decision['status'], 'approved'>,
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
