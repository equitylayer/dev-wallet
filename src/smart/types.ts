import { type Address, type Hex, hexToBigInt, numberToHex } from 'viem'

/** A call as the wallet handles it internally (bigint value). */
export type Call = { to?: Address; value?: bigint; data?: Hex }

/** A call as it appears on the JSON-RPC wire (hex-quantity value). */
export type RpcCall = { to?: Address; value?: Hex; data?: Hex }

export function toCall(c: RpcCall): Call {
  return {
    ...(c.to !== undefined && { to: c.to }),
    ...(c.value !== undefined && { value: hexToBigInt(c.value) }),
    ...(c.data !== undefined && { data: c.data }),
  }
}

export function toRpcCall(c: Call): RpcCall {
  return {
    ...(c.to !== undefined && { to: c.to }),
    ...(c.value !== undefined && { value: numberToHex(c.value) }),
    ...(c.data !== undefined && { data: c.data }),
  }
}

export type AccountMode = 'smart' | 'plain-upgradable' | 'plain-never'

export type OnchainKind =
  | { kind: 'eoa' }
  | { kind: 'kernel' }
  | { kind: 'delegated'; target: Address }
  | { kind: 'contract' }

export type AtomicStatus = 'supported' | 'ready' | 'unsupported'

export type SponsorSetting =
  | { kind: 'devwallet' }
  | { kind: 'account'; address: Address }
  | { kind: 'off' }
