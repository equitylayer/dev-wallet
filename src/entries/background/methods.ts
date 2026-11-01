// Chrome-free on purpose: the background handler, the side-panel opener and the
// unit tests all share these lists, so nothing here may import a store or
// `chrome.*`. Settings are passed in.
import { INVALID_PARAMS, WalletRpcError } from '~/smart/errors'

export const SIGNATURE_METHODS = [
  'eth_sign',
  'personal_sign',
  'eth_signTypedData_v4',
] as const
export const TRANSACTION_METHODS = [
  'eth_sendTransaction',
  'wallet_sendCalls',
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

/** Whether the user has to approve this method before it is executed. */
export function requiresApproval(
  method: string,
  s: ApprovalSettings,
): boolean {
  if (isOneOf(SIGNATURE_METHODS, method)) return !s.bypassSignatureAuth
  if (isOneOf(TRANSACTION_METHODS, method)) return !s.bypassTransactionAuth
  return false
}

/** Whether a request for this method should open the side panel. */
export function opensSidebar(method: string, s: ApprovalSettings): boolean {
  return requiresApproval(method, s) || isOneOf(SIDEBAR_METHODS, method)
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
