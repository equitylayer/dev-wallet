// What a message-signature request (`eth_sign`, `personal_sign`) needs to
// say before it is signed. Pure, so it is unit-tested.
//
// Anvil and geth sign both methods the same way: the payload's bytes as a
// personal message, with the EIP-191 prefix. Neither signs a raw hash, so
// neither can sign a transaction directly. A 32-byte payload is the risk: a
// contract that checks `toEthSignedMessageHash(hash)`, as Kernel's ECDSA
// validator does for a user operation, accepts that signature.

const HASH = /^0x[0-9a-f]{64}$/i

/** Exactly 32 bytes of hex: what a hash looks like. */
export function looksLikeHash(data: unknown): boolean {
  return typeof data === 'string' && HASH.test(data)
}

/**
 * The notice a signature request needs: `hash` warns that a 32-byte payload
 * can authorize a transaction or user operation; `prefixed` notes that
 * `eth_sign` signs its data as a prefixed personal message; `null`, none.
 */
export function signNotice(
  method: 'eth_sign' | 'personal_sign',
  data: unknown,
): 'hash' | 'prefixed' | null {
  if (looksLikeHash(data)) return 'hash'
  return method === 'eth_sign' ? 'prefixed' : null
}
