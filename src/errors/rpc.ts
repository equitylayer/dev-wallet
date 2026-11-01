import type { RpcRequest } from '~/types/rpc'
import { BaseError } from './base.js'

/**
 * A JSON-RPC / EIP-1193 error code. Any number, since the wallet forwards the
 * node's and EIP-5792's codes (3, 5700-5760, -32xxx) as well as the EIP-1193
 * ones (4001, 4100, 4200, 4900, 4901, 4902).
 */
export type ProviderRpcErrorCode = number

type ProviderRpcErrorOptions = {
  code: ProviderRpcErrorCode
  details?: string
  metaMessages?: string[]
  shortMessage: string
}

type RpcError<T = unknown> = {
  code: number
  message: string
  data?: T
}

/**
 * Error subclass implementing Ethereum Provider errors per EIP-1193.
 *
 * - EIP https://eips.ethereum.org/EIPS/eip-1193
 */
export class ProviderRpcError<TData = unknown> extends BaseError {
  name = 'ProviderRpcError'

  code: ProviderRpcErrorCode
  data?: TData

  constructor(
    error: RpcError<TData> | Error,
    { code, details, metaMessages, shortMessage }: ProviderRpcErrorOptions,
  ) {
    super(shortMessage, {
      details: details || error.message,
      metaMessages,
    })
    this.code = code
    if ('data' in error) this.data = error.data
  }
}

/**
 * Subclass for a "User Rejected Request" EIP-1193 error.
 *
 * EIP https://eips.ethereum.org/EIPS/eip-1193#provider-errors
 */
export class UserRejectedRequestError extends ProviderRpcError {
  static code = 4001 as const
  static message = 'The user rejected the request.' as const

  override name = 'UserRejectedRequestError'

  request?: RpcRequest

  constructor(error: RpcError<{ request: RpcRequest }>) {
    const request = error.data?.request

    super(error, {
      code: UserRejectedRequestError.code,
      metaMessages: request
        ? [`Request: ${JSON.stringify(request, null, 2)}`]
        : undefined,
      shortMessage: UserRejectedRequestError.message,
    })

    this.request = error.data?.request
  }
}

/**
 * Subclass for an "Unauthorized" EIP-1193 error.
 *
 * EIP https://eips.ethereum.org/EIPS/eip-1193#provider-errors
 */
export class UnauthorizedProviderError extends ProviderRpcError {
  static code = 4100

  override name = 'UnauthorizedProviderError'

  constructor(error: RpcError | Error) {
    super(error, {
      code: 4100,
      shortMessage:
        'The requested method and/or account has not been authorized by the user.',
    })
  }
}

/**
 * Subclass for an "Unsupported Method" EIP-1193 error.
 *
 * EIP https://eips.ethereum.org/EIPS/eip-1193#provider-errors
 */
export class UnsupportedProviderMethodError extends ProviderRpcError {
  static code = 4200

  override name = 'UnsupportedProviderMethodError'

  constructor(error: RpcError | Error) {
    super(error, {
      code: 4200,
      shortMessage: 'The Provider does not support the requested method.',
    })
  }
}

/**
 * Subclass for an "Disconnected" EIP-1193 error.
 *
 * EIP https://eips.ethereum.org/EIPS/eip-1193#provider-errors
 */
export class ProviderDisconnectedError extends ProviderRpcError {
  static code = 4900

  override name = 'ProviderDisconnectedError'

  constructor(error: Error) {
    super(error, {
      code: 4900,
      shortMessage: 'The Provider is disconnected from all chains.',
    })
  }
}

/**
 * Subclass for an "Chain Disconnected" EIP-1193 error.
 *
 * EIP https://eips.ethereum.org/EIPS/eip-1193#provider-errors
 */
export class ChainDisconnectedError extends ProviderRpcError {
  static code = 4901

  override name = 'ChainDisconnectedError'

  constructor(error: Error) {
    super(error, {
      code: 4901,
      shortMessage: 'The Provider is not connected to the requested chain.',
    })
  }
}

/**
 * Subclass for an "Switch Chain" EIP-1193 error.
 *
 * EIP https://eips.ethereum.org/EIPS/eip-1193#provider-errors
 */
export class SwitchChainError extends ProviderRpcError {
  static code = 4902

  override name = 'SwitchChainError'

  constructor(error: Error) {
    super(error, {
      code: 4902,
      shortMessage: 'An error occurred when attempting to switch chain.',
    })
  }
}

/**
 * Subclass for an unknown RPC error.
 */
export class UnknownRpcError extends ProviderRpcError {
  static code = -1

  override name = 'UnknownRpcError'

  constructor(error: RpcError) {
    super(error, {
      code: -1,
      shortMessage: 'An unknown RPC error occurred.',
    })
  }
}

/**
 * Rebuilds the error a dApp should see from the `{ code, message, data }` the
 * background replies with. Keeps the numeric code and `data` for every code
 * (dApps and viem read `error.code` for EIP-5792 and `error.data` for revert
 * data), and the class for the EIP-1193 codes that have one.
 */
export function toProviderError(error: {
  code: number
  message: string
  data?: unknown
}): Error {
  if (error.code === UserRejectedRequestError.code)
    return new UserRejectedRequestError(
      error as RpcError<{ request: RpcRequest }>,
    )
  if (error.code === UnauthorizedProviderError.code)
    return new UnauthorizedProviderError(error)
  if (error.code === UnsupportedProviderMethodError.code)
    return new UnsupportedProviderMethodError(error)

  const providerError = new ProviderRpcError(error, {
    code: error.code,
    shortMessage: error.message,
  })
  // `BaseError` decorates the message with details and a version line, which
  // would bury the node's own message (callers match on it).
  if (error.message) providerError.message = error.message
  return providerError
}
