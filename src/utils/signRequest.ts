// What a message-signature request (`eth_sign`, `personal_sign`) signs, and
// what needs saying before it is signed. Pure, so it is unit-tested.
//
// The wallet sends both methods to the node as `eth_sign`. Anvil and geth
// sign the payload's bytes as a personal message, with the EIP-191 prefix.
// Neither signs a raw hash, so neither can sign a transaction directly. A
// 32-byte payload is the risk: a contract that checks
// `toEthSignedMessageHash(hash)`, as Kernel's ECDSA validator does for a user
// operation, accepts that signature.
//
// Anvil 1.7.1 (alloy `Bytes`) decodes the payload as hex with or without a
// lowercase `0x`, in either case, or as a JSON array of u8 (an empty one is 0
// bytes). It refuses anything else: odd length, `0X`, non-hex, plain text, an
// array element that isn't an integer 0–255 (probed against a local anvil).
// So the payload is read the way it decodes, shown as the 0x-prefixed bytes,
// and forwarded in that form: what the screen shows is what gets signed.
import { type Hex, bytesToHex, hexToBytes, size } from 'viem'

const NODE_HEX = /^(?:0x)?((?:[0-9a-fA-F]{2})*)$/

const isByte = (item: unknown): item is number =>
  typeof item === 'number' && Number.isInteger(item) && item >= 0 && item <= 255

/**
 * The bytes the node signs for a payload, as 0x-prefixed lowercase hex, or
 * `null` when the node refuses it.
 */
export function payloadBytes(data: unknown): Hex | null {
  if (Array.isArray(data))
    return data.every(isByte) ? bytesToHex(new Uint8Array(data)) : null
  if (typeof data !== 'string') return null
  const match = NODE_HEX.exec(data)
  return match ? `0x${(match[1] as string).toLowerCase()}` : null
}

/** Decodes to exactly 32 bytes: what a hash looks like. */
export function looksLikeHash(data: unknown): boolean {
  const bytes = payloadBytes(data)
  return bytes !== null && size(bytes) === 32
}

export type SignNoticeKind = 'hash' | 'prefixed' | 'refused'

/**
 * The notice a signature request needs: `hash` warns that a 32-byte payload
 * can authorize a transaction or user operation; `prefixed` notes that
 * `eth_sign` signs its data as a prefixed personal message; `refused` says
 * the node won't sign the payload (neither hex nor an array of bytes); `null`,
 * none.
 */
export function signNotice(
  method: 'eth_sign' | 'personal_sign',
  data: unknown,
): SignNoticeKind | null {
  const bytes = payloadBytes(data)
  if (bytes === null) return 'refused'
  if (size(bytes) === 32) return 'hash'
  return method === 'eth_sign' ? 'prefixed' : null
}

// Control and format characters (a right-to-left override, a byte order
// mark, …) could hide what the text says; line breaks and tabs can't.
const HIDDEN = /(?![\n\r\t])[\p{Cc}\p{Cf}]/u

/**
 * The bytes as text, when they are plain UTF-8 that shows every character
 * it holds; `null` when they should be shown as hex.
 */
export function readableText(bytes: Hex): string | null {
  try {
    const text = new TextDecoder('utf-8', {
      fatal: true,
      ignoreBOM: true,
    }).decode(hexToBytes(bytes))
    return HIDDEN.test(text) ? null : text
  } catch {
    return null
  }
}

/**
 * The request's params with the payload as the bytes the screen shows (the
 * same params when already so, or when the node refuses the payload).
 */
export function canonicalParams<T extends readonly unknown[]>(
  method: 'eth_sign' | 'personal_sign',
  params: T,
): T {
  const at = method === 'eth_sign' ? 1 : 0
  const bytes = payloadBytes(params[at])
  if (bytes === null || bytes === params[at]) return params
  const next = [...params]
  next[at] = bytes
  return next as unknown as T
}
