import {
  type Address,
  type RpcTransactionReceipt,
  type RpcTransactionRequest,
  keccak256,
  numberToHex,
  stringToHex,
} from 'viem'
import { type HttpRpcClient, getHttpRpcClient } from 'viem/utils'

import {
  UnauthorizedProviderError,
  UnsupportedProviderMethodError,
  UserRejectedRequestError,
} from '~/errors'
import { type Messenger, getMessenger } from '~/messengers'
import { connectNode, nodeMethod } from '~/smart/node'
import type { RpcRequest, RpcResponse } from '~/types/rpc'
import {
  accountStore,
  batchCallsStore,
  networkStore,
  sessionsStore,
  settingsStore,
} from '~/zustand'

import {
  assertEthAccountsRequest,
  permissionsFor,
  requiresApproval,
  withSerializedErrors,
} from './methods'
import { type Decision, requestUserDecision } from './pending-requests'

const inpageMessenger = getMessenger('background:inpage')
const walletMessenger = getMessenger('background:wallet')

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

    // If the method is a "signable" method, request approval from the user.
    if (requiresApproval(request.method, settingsStore.getState())) {
      if (isInpage && !session)
        return {
          id: request.id,
          jsonrpc: '2.0',
          error: {
            code: UnauthorizedProviderError.code,
            message:
              'The requested account and/or method has not been authorized by the user.',
          },
        } as RpcResponse

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
        if (bypassConnectAuth) return authorize()

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

      if (request.method === 'wallet_getCallsStatus') {
        const batchId = request.params![0]
        const { transactionHashes } = batchCallsStore
          .getState()
          .getRecord(rpcUrl, batchId)!

        const responses = await Promise.allSettled(
            transactionHashes.map((hash) =>
                rpcClient.request({
                  body: {
                    method: 'eth_getTransactionReceipt',
                    params: [hash],
                  },
                }),
            ),
        )
        const pending = responses.some(
            (response) =>
                response.status === 'rejected' || !response.value.result,
        )

        return {
          id: request.id,
          jsonrpc: '2.0',
          result: {
            status: pending ? 'PENDING' : 'CONFIRMED',
            receipts: pending
                ? []
                : responses
                    .map((response) => {
                      if (response.status === 'rejected') return
                      const receipt = response.value
                          .result as RpcTransactionReceipt
                      return {
                        blockHash: receipt.blockHash,
                        blockNumber: receipt.blockNumber,
                        gasUsed: receipt.gasUsed,
                        logs: receipt.logs,
                        transactionHash: receipt.transactionHash,
                        status: receipt.status,
                      }
                    })
                    .filter(Boolean),
          },
        } as RpcResponse
      }

      if (request.method === 'wallet_getCapabilities') {
        const { networks } = networkStore.getState()
        return {
          id: request.id,
          jsonrpc: '2.0',
          result: networks.reduce((capabilities, network) => {
            return {
              ...capabilities,
              [numberToHex(network.chainId)]: {
                atomicBatch: {
                  supported: false,
                },
              },
            }
          }, {}),
        } as RpcResponse
      }

      if (request.method === 'wallet_showCallsStatus') {
        const batchId = request.params![0]
        const { transactionHashes } = batchCallsStore
          .getState()
          .getRecord(rpcUrl, batchId)!
        walletMessenger.send(
            'pushRoute',
            `/transaction/${transactionHashes[0]}`,
        )
        return {
          id: request.id,
          jsonrpc: '2.0',
          result: undefined,
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
    error: {
      code: UserRejectedRequestError.code,
      message:
          status === 'expired'
              ? 'The request timed out waiting for approval.'
              : UserRejectedRequestError.message,
      data: { request },
    },
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

  const response = (await (() => {
    if (request.method === 'wallet_sendCalls') {
      return handleSendCalls({
        ...request.params![0],
        id: request.id,
        rpcClient,
        rpcUrl,
      } as any)
    }

    // Hardhat exposes the Anvil cheat methods under `hardhat_*`.
    return connectNode({ rpcUrl }).then(({ kind }) =>
      rpcClient.request({
        body: { ...request, method: nodeMethod(kind, request.method) },
      }),
    )
  })()) as unknown as RpcResponse

  if (
      request.method === 'eth_sendTransaction' ||
      request.method === 'wallet_sendCalls'
  )
    walletMessenger.send('transactionExecuted', undefined)

  return response
}

async function handleSendCalls({
                                 calls,
                                 from,
                                 id,
                                 rpcClient,
                                 rpcUrl,
                               }: {
  calls: RpcTransactionRequest[]
  from: Address
  id: number
  rpcClient: HttpRpcClient
  rpcUrl: string
}) {
  const { putRecord } = batchCallsStore.getState()

  // Simulate calls for errors (to ensure atomicity).
  for (const call of calls) {
    const { error } = await rpcClient.request({
      body: {
        method: 'eth_call',
        params: [{ ...call, from: from ?? call.from, nonce: undefined }],
      },
    })
    if (error) throw new Error(error.message)
  }

  // Disable automining (if enabled) to mine transactions atomically.
  const automine = await rpcClient
      .request({
        body: {
          method: 'anvil_getAutomine',
        },
      })
      .catch(() => {})
  if (automine?.result)
    await rpcClient.request({
      body: {
        method: 'evm_setAutomine',
        params: [false],
      },
    })

  try {
    const transactionHashes = []
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i]
      const { result, error } = await rpcClient.request({
        body: {
          method: 'eth_sendTransaction',
          params: [
            {
              ...call,
              from: from ?? call.from,
              nonce: undefined,
            },
          ],
        },
      })
      if (error) throw new Error(error.message)

      transactionHashes.push(result)
    }

    // Mine a block if automining was originally enabled.
    if (automine?.result)
      await rpcClient.request({
        body: {
          method: 'anvil_mine',
          params: ['0x1', '0x0'],
        },
      })

    const batchId = keccak256(stringToHex(JSON.stringify(transactionHashes)))
    putRecord({
      id: batchId,
      rpcUrl,
      chainId: await connectNode({ rpcUrl }).then((node) => node.chainId()),
      from,
      calls: calls.map(({ to, value, data }) => ({
        ...(to && { to }),
        ...(value && { value }),
        ...(data && { data }),
      })),
      path: 'sequential',
      transactionHashes,
      createdAt: Date.now(),
    })

    return { id, jsonrpc: '2.0', result: batchId }
  } finally {
    // Re-enable automining (if previously enabled).
    if (automine?.result)
      await rpcClient.request({
        body: {
          method: 'evm_setAutomine',
          params: [true],
        },
      })
  }
}
