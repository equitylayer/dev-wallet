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

export function serializeError(e: unknown): {
  code: number
  message: string
  data?: unknown
} {
  if (e instanceof WalletRpcError)
    return {
      code: e.code,
      message: e.message,
      ...(e.data !== undefined && { data: e.data }),
    }
  return {
    code: INTERNAL_ERROR,
    message: e instanceof Error ? e.message : String(e),
  }
}
