import type { Address } from 'viem'

import type { ReconcileResult } from '~/smart/modes'
import type { SendPreview } from '~/smart/preview'
import type { AccountModeAction } from '~/smart/resolve'
import type { AaStatus } from '~/smart/setup'
import type { RpcCall } from '~/smart/types'
import type { RpcRequest, RpcResponse } from '~/types/rpc'
import type { SessionsState } from '~/zustand'

export type Schema = {
  accountsChanged: [
    payload: { accounts: Address[]; sessions: SessionsState['sessions'] },
    response: void,
  ]
  /**
   * The batch review's changes to the open batch; the background is its only
   * writer. `open` is "Start batch", `sign` with `force` is "Sign anyway", and
   * `remove` takes a request (a `wallet_sendCalls` whole) out, with 4001.
   * `sign` names the requests the review showed, in its order: a batch that
   * changed since is refused (`BATCH_CHANGED`). `move` puts a request at
   * position `to`.
   */
  batchQueue: [
    payload:
      | { action: 'sign'; reviewed: number[]; force?: boolean }
      | { action: 'discard' }
      | { action: 'open'; rpcUrl: string; account: Address }
      | { action: 'remove'; requestId: number }
      | { action: 'move'; requestId: number; to: number },
    response:
      | { ok: true }
      | { ok: false; error: { code: number; message: string; data?: unknown } },
  ]
  chainChanged: [
    payload: { chainId: string; sessions: SessionsState['sessions'] },
    response: void,
  ]
  connect: [payload: { chainId: string }, response: void]
  disconnect: [payload: undefined, response: void]
  injectProvider: [payload: void, response: void]
  notice: [payload: { message: string }, response: void]
  /**
   * The user's decision on a pending request. A `batched` decision that can't
   * join a batch is refused: the send rejects with why, and the request stays
   * pending.
   */
  pendingRequest: [
    payload: {
      request: RpcRequest
      status: 'approved' | 'rejected' | 'batched'
      /** Send even though the simulation failed ("Sign anyway"). */
      force?: boolean
    },
    response: void,
  ]
  ping: [payload: void, response: string]
  previewSend: [
    payload: {
      rpcUrl: string
      from: Address
      calls: RpcCall[]
      atomicRequired: boolean
      /**
       * The request being previewed. Only a `wallet_sendCalls` upgrades a
       * plain-upgradable account, so only it previews as smart.
       */
      method: 'eth_sendTransaction' | 'wallet_sendCalls'
    },
    response: SendPreview,
  ]
  pushRoute: [payload: string, response: void]
  request: [
    payload: { request: RpcRequest; rpcUrl?: string },
    response: RpcResponse,
  ]
  setAccountMode: [
    payload: {
      rpcUrl: string
      address: Address
      action: AccountModeAction
    },
    response: ReconcileResult,
  ]
  smartStatus: [payload: { rpcUrl: string }, response: AaStatus]
  toggleTheme: [payload: void, response: void]
  transactionExecuted: [payload: void, response: void]
}
