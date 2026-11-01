/** A JSON-RPC error that keeps its numeric code (EIP-1193 / EIP-1474). */
export class WalletRpcError extends Error {
  code: number
  data?: unknown

  constructor(code: number, message: string, data?: unknown) {
    super(message)
    this.name = 'WalletRpcError'
    this.code = code
    this.data = data
  }
}

const INTERNAL_ERROR = -32603
export const INVALID_PARAMS = -32602
/** EIP-1193: the requested account isn't one the wallet holds. */
export const UNAUTHORIZED = 4100

export function unauthorizedAccount(address: string): WalletRpcError {
  return new WalletRpcError(
    UNAUTHORIZED,
    `The account ${address} is not one of the wallet's accounts`,
  )
}

/**
 * Any thrown error with a numeric `code` keeps `{ code, message, data }`:
 * wallet errors, and node errors viem throws over HTTP (`RpcRequestError`, when
 * a hosted RPC answers a JSON-RPC error with a non-2xx status). Everything else,
 * including Node system errors whose `code` is a string (`'ECONNREFUSED'`),
 * becomes `-32603`.
 */
export function serializeError(e: unknown): {
  code: number
  message: string
  data?: unknown
} {
  if (typeof e === 'object' && e !== null) {
    const { code, data } = e as { code?: unknown; data?: unknown }
    if (typeof code === 'number' && Number.isInteger(code))
      return {
        code,
        message: messageOf(e),
        ...(data !== undefined && { data }),
      }
  }
  return {
    code: INTERNAL_ERROR,
    message: e instanceof Error ? e.message : String(e),
  }
}

function messageOf(e: object): string {
  const { details, message, shortMessage } = e as {
    details?: unknown
    message?: unknown
    shortMessage?: unknown
  }
  // viem decorates `message` with the request and a version line; `details`
  // holds the node's own text.
  if (typeof shortMessage === 'string' && typeof details === 'string' && details)
    return details
  return typeof message === 'string' ? message : String(e)
}
