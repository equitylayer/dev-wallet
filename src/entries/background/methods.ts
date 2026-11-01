// Chrome-free on purpose: the background handler, the side-panel opener and the
// unit tests all share these lists, so nothing here may import a store or
// `chrome.*`. Settings are passed in.
import { INVALID_PARAMS, WalletRpcError, serializeError } from '~/smart/errors'
import type { RpcResponse } from '~/types/rpc'

export const SIGNATURE_METHODS = [
  'eth_sign',
  'personal_sign',
  'eth_signTypedData_v4',
] as const
export const TRANSACTION_METHODS = [
  'eth_sendTransaction',
  'wallet_sendCalls',
] as const

/**
 * Methods the node signs or sends with an account's key, past both the
 * approval and the smart-account core: a page may call them only while
 * transactions are bypassed (R49). `eth_sendUnsignedTransaction` needs no key
 * at all: Anvil sends it from any address (R53).
 */
const NODE_SIGNED_METHODS = [
  'eth_signTransaction',
  'eth_sendTransactionSync',
  'eth_sendUnsignedTransaction',
] as const

/**
 * Every method that signs or sends with an account's key on the node (Anvil
 * 1.7.1 and Hardhat), the wallet's own sends included. A page must be
 * connected to call any of them, whatever the bypass settings: bypassing
 * the approval is not authorizing the site.
 */
const SESSION_METHODS = [
  ...SIGNATURE_METHODS,
  ...TRANSACTION_METHODS,
  ...NODE_SIGNED_METHODS,
  'eth_signTypedData',
  'eth_signTypedData_v3',
] as const

/**
 * All a page may ask before it is connected (R53): the node's reads, and
 * connecting. Anything else, the node's cheats and raw sends included, waits
 * for a session, as do the EIP-5792 reads, which reconcile (and so write
 * code). A deny-by-default list: a method missing here costs an unconnected
 * dApp a 4100, never the node a write.
 */
const OPEN_TO_ANY_PAGE = [
  // The chain.
  'eth_chainId',
  'net_version',
  'web3_clientVersion',
  'eth_syncing',
  'eth_blockNumber',
  // Calls and estimates, which change nothing.
  'eth_call',
  'eth_estimateGas',
  'eth_createAccessList',
  'eth_simulateV1',
  // Fees.
  'eth_feeHistory',
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_blobBaseFee',
  // State, blocks, transactions and logs.
  'eth_getBalance',
  'eth_getCode',
  'eth_getStorageAt',
  'eth_getTransactionCount',
  'eth_getProof',
  'eth_getAccount',
  'eth_getAccountInfo',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_getBlockReceipts',
  'eth_getBlockTransactionCountByHash',
  'eth_getBlockTransactionCountByNumber',
  'eth_getUncleCountByBlockHash',
  'eth_getUncleCountByBlockNumber',
  'eth_getUncleByBlockHashAndIndex',
  'eth_getUncleByBlockNumberAndIndex',
  'eth_getTransactionByHash',
  'eth_getTransactionByBlockHashAndIndex',
  'eth_getTransactionByBlockNumberAndIndex',
  'eth_getTransactionBySenderAndNonce',
  'eth_getRawTransactionByHash',
  'eth_getRawTransactionByBlockHashAndIndex',
  'eth_getRawTransactionByBlockNumberAndIndex',
  'eth_getTransactionReceipt',
  'eth_getLogs',
  // Log and block filters: ethers' and viem's event watchers poll them.
  'eth_newFilter',
  'eth_newBlockFilter',
  'eth_newPendingTransactionFilter',
  'eth_getFilterChanges',
  'eth_getFilterLogs',
  'eth_uninstallFilter',
  // Connecting, and asking whether it is.
  'eth_requestAccounts',
  'eth_accounts',
  'wallet_requestPermissions',
  'wallet_getPermissions',
] as const

/**
 * Typed data the node signs with an account's key, past the approval (which
 * renders v4 only): a page may ask for them only while signatures are
 * bypassed (R52). v3 covers an EIP-2612 permit.
 */
const NODE_SIGNED_TYPED_DATA = [
  'eth_signTypedData',
  'eth_signTypedData_v3',
] as const

/**
 * Methods whose first param is a transaction from an account: a page's that
 * names none goes from the active account, never the node's default (R50).
 */
const FROM_METHODS = [
  'eth_sendTransaction',
  ...NODE_SIGNED_METHODS,
] as const

/** Methods that open the side panel without needing a decision to execute. */
const SIDEBAR_METHODS = [
  'eth_requestAccounts',
  'wallet_requestPermissions',
  'wallet_showCallsStatus',
] as const

type ApprovalSettings = {
  bypassSignatureAuth?: boolean
  bypassTransactionAuth?: boolean
}

const isOneOf = (list: readonly string[], method: string) =>
  list.includes(method)

/** Whether the method sends a transaction (and so runs the execution core). */
export function isTransactionMethod(
  method: string,
): method is (typeof TRANSACTION_METHODS)[number] {
  return isOneOf(TRANSACTION_METHODS, method)
}

/** Whether the method asks for a signature the approval shows (`SIGNATURE_METHODS`). */
export function isSignatureMethod(
  method: string,
): method is (typeof SIGNATURE_METHODS)[number] {
  return isOneOf(SIGNATURE_METHODS, method)
}

/** Whether the user has to approve this method before it is executed. */
export function requiresApproval(
  method: string,
  s: ApprovalSettings,
): boolean {
  if (isSignatureMethod(method)) return !s.bypassSignatureAuth
  if (isOneOf(TRANSACTION_METHODS, method)) return !s.bypassTransactionAuth
  return false
}

/** Whether only a connected site may call this method (`SESSION_METHODS`). */
export function needsSession(method: string): boolean {
  return isOneOf(SESSION_METHODS, method)
}

/**
 * Whether a page's request for this method is refused (4200): the node would
 * sign it unasked. A transaction (`NODE_SIGNED_METHODS`, past the smart core
 * too) only with transactions bypassed; typed data the approval can't show
 * (`NODE_SIGNED_TYPED_DATA`) only with signatures bypassed. Asked only of a
 * connected page.
 */
export function refusedFromPage(method: string, s: ApprovalSettings): boolean {
  if (isOneOf(NODE_SIGNED_METHODS, method)) return !s.bypassTransactionAuth
  if (isOneOf(NODE_SIGNED_TYPED_DATA, method)) return !s.bypassSignatureAuth
  return false
}

/** Whether a page's request names the account it sends from (`FROM_METHODS`). */
export function takesFrom(method: string): boolean {
  return isOneOf(FROM_METHODS, method)
}

/**
 * Whether a page that isn't connected may call this method
 * (`OPEN_TO_ANY_PAGE`). Asked after `needsSession`, of a page with no session.
 */
export function openToAnyPage(method: string): boolean {
  return isOneOf(OPEN_TO_ANY_PAGE, method)
}

/**
 * Whether a page's request for this method should open the side panel. A
 * page that isn't connected gets it only for what it may call
 * (`openToAnyPage`), which never depends on the settings: otherwise it could
 * watch the panel open, or not, and learn whether approvals are bypassed.
 */
export function opensSidebar(
  method: string,
  s: ApprovalSettings,
  { connected }: { connected: boolean },
): boolean {
  if (!connected && !openToAnyPage(method)) return false
  return requiresApproval(method, s) || isOneOf(SIDEBAR_METHODS, method)
}

/**
 * The node a request goes to. A page's always goes to the wallet's network:
 * the page posts the message itself, so the `rpcUrl` in it is the page's to
 * pick. A wallet screen may name one (the network it shows).
 */
export function requestRpcUrl({
  fromPage,
  requested,
  current,
}: {
  fromPage: boolean
  requested: string | undefined
  current: string
}): string {
  if (fromPage) return current
  return requested || current
}

/** EIP-1193: the user rejected the request. */
export const USER_REJECTED = 4001
/** EIP-5792: the user declined the account upgrade a batch needed. */
const UPGRADE_REJECTED = 5750

/**
 * The error for a request the user didn't approve: `4001`, or `5750` when what
 * they rejected was the account upgrade a `wallet_sendCalls` needed. A timeout
 * is always `4001`.
 */
export function declinedError(
  request: unknown,
  status: 'rejected' | 'expired',
  { upgrade = false }: { upgrade?: boolean } = {},
): WalletRpcError {
  const data = { request }
  switch (status) {
    case 'expired':
      return new WalletRpcError(
        USER_REJECTED,
        'The request timed out waiting for approval.',
        data,
      )
    case 'rejected':
      return upgrade
        ? new WalletRpcError(
            UPGRADE_REJECTED,
            'The user rejected the upgrade to a smart account.',
            data,
          )
        : new WalletRpcError(
            USER_REJECTED,
            'The user rejected the request.',
            data,
          )
  }
}

/** EIP-2255 permission, as returned by `wallet_{get,request}Permissions`. */
export type Permission = {
  invoker: string
  parentCapability: 'eth_accounts'
  caveats: []
}

/** The permissions an origin holds: `eth_accounts` once it is connected. */
export function permissionsFor(
  origin: string,
  connected: boolean,
): Permission[] {
  if (!connected) return []
  return [{ invoker: origin, parentCapability: 'eth_accounts', caveats: [] }]
}

/**
 * `wallet_requestPermissions` params must be `[{ eth_accounts: {} }]`: the only
 * capability DevWallet grants. Anything else is `-32602`.
 */
export function assertEthAccountsRequest(params: unknown): void {
  const invalid = (message: string) =>
    new WalletRpcError(INVALID_PARAMS, message)

  if (!Array.isArray(params) || params.length !== 1)
    throw invalid('Expected params: [{ eth_accounts: {} }]')

  const [requested] = params as unknown[]
  if (!isPlainObject(requested))
    throw invalid('Expected params: [{ eth_accounts: {} }]')

  const capabilities = Object.keys(requested)
  if (capabilities.length === 0)
    throw invalid('No permission requested; expected { eth_accounts: {} }')
  const unsupported = capabilities.filter((name) => name !== 'eth_accounts')
  if (unsupported.length > 0)
    throw invalid(
      `Unsupported permission: ${unsupported.join(', ')}. Only eth_accounts can be requested`,
    )
  if (!isPlainObject(requested.eth_accounts))
    throw invalid('Expected eth_accounts to be an object')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Wraps a request handler so anything it throws goes back as a JSON-RPC error
 * object. The messenger would otherwise reduce a throw to its message and lose
 * the code and data that dApps read (3, 4001, 5700-5760, ...).
 */
export function withSerializedErrors<
  TPayload extends { request: { id: number } },
  TMeta,
>(
  handler: (payload: TPayload, meta: TMeta) => Promise<RpcResponse>,
): (payload: TPayload, meta: TMeta) => Promise<RpcResponse> {
  return async (payload, meta) => {
    try {
      return await handler(payload, meta)
    } catch (error) {
      return {
        id: payload.request.id,
        jsonrpc: '2.0',
        error: serializeError(error),
      }
    }
  }
}
