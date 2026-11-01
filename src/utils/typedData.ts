// Typed data (`eth_signTypedData_v4`) for the approval screen: structured
// fields instead of raw JSON, and Kernel's ERC-1271 wrapper named for what it
// is (spec §8). It shows only what gets signed. Pure, so it is unit-tested.
//
// Signers disagree on the domain. Anvil (alloy's `TypedData`), which signs
// here, signs every standard field the domain carries, whatever
// `types.EIP712Domain` declares. viem's `hashTypedData` signs only the
// declared fields; without `EIP712Domain`, it derives one from the fields the
// domain carries (`getTypesForEIP712Domain`), and so does this, reading a
// chain id in any numeric form, as anvil does. Other implementations differ
// again (eth-sig-util signs an empty domain when `EIP712Domain` is absent),
// so the flag is about agreement with the declared type, not any wallet.
import { type Address, type Hex, isAddress, isHex, size } from 'viem'

export type TypedDataInput = {
  domain?: Record<string, unknown>
  types: Record<string, { name: string; type: string }[]>
  primaryType: string
  message: Record<string, unknown>
}

/** One leaf of the message: `details.amount`, `items[0].to`, … */
export type TypedDataField = { path: string; type: string; value: string }

export type DescribedTypedData =
  | {
      /** Kernel's `Kernel(bytes32 hash)` wrapper of an ERC-1271 signature. */
      kind: 'kernel-1271'
      account: Address
      innerHash: Hex
      chainId: number
      version: string
    }
  | {
      kind: 'generic'
      primaryType: string
      /**
       * The domain's fields that a signer signs, in EIP-712 order, then any
       * others.
       */
      domain: [string, string][]
      /** Domain fields that only some signers sign (see the top). */
      disputed: string[]
      fields: TypedDataField[]
    }

/** The fields of alloy's `Eip712Domain`, in EIP-712 order. */
const DOMAIN_ORDER = ['name', 'version', 'chainId', 'verifyingContract', 'salt']
const KERNEL_DOMAIN = ['name', 'version', 'chainId', 'verifyingContract']
const INTEGER_TYPE = /^u?int\d*$/
const ARRAY_TYPE = /^(.+)\[\d*\]$/
const INTEGER_TEXT = /^(-?\d+|0x[0-9a-f]+)$/i

/** A decimal string for a bigint, number, hex or decimal string; else null. */
function toDecimal(value: unknown): string | null {
  try {
    if (typeof value === 'bigint') return value.toString()
    if (typeof value === 'number' && Number.isSafeInteger(value))
      return value.toString()
    if (typeof value === 'string' && INTEGER_TEXT.test(value))
      return BigInt(value).toString()
  } catch {
    // Not a number after all: shown as it came.
  }
  return null
}

function render(type: string, value: unknown): string {
  if (value === undefined || value === null) return ''
  if (INTEGER_TYPE.test(type)) return toDecimal(value) ?? String(value)
  if (typeof value === 'object')
    return JSON.stringify(value, (_, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    )
  return String(value)
}

function walk(
  types: TypedDataInput['types'],
  type: string,
  value: unknown,
  path: string,
  out: TypedDataField[],
): void {
  const array = ARRAY_TYPE.exec(type)
  if (array && Array.isArray(value) && value.length > 0) {
    const base = array[1] as string
    value.forEach((item, i) => walk(types, base, item, `${path}[${i}]`, out))
    return
  }
  const struct = types[type]
  if (struct && typeof value === 'object' && value !== null && !array) {
    const record = value as Record<string, unknown>
    for (const field of struct) {
      const fieldPath = path ? `${path}.${field.name}` : field.name
      walk(types, field.type, record[field.name], fieldPath, out)
    }
    return
  }
  out.push({
    path,
    type,
    value: Array.isArray(value) ? '[]' : render(type, value),
  })
}

/**
 * The domain fields that get signed, and those only some signers sign: anvil
 * signs the standard fields the domain carries, viem the declared ones.
 */
function signedDomain(td: TypedDataInput): {
  keys: string[]
  disputed: string[]
} {
  const domain = td.domain ?? {}
  const carried = Object.keys(domain).filter(
    (key) => domain[key] !== undefined && domain[key] !== null,
  )
  const types = td.types.EIP712Domain
  const declared = new Set(
    Array.isArray(types)
      ? types.map((field) => field.name)
      : DOMAIN_ORDER.filter((key) =>
          key === 'chainId'
            ? toDecimal(domain.chainId) !== null
            : key === 'name' || key === 'version'
              ? typeof domain[key] === 'string'
              : Boolean(domain[key]),
        ),
  )
  const byAnvil = (key: string) => DOMAIN_ORDER.includes(key)
  const byViem = (key: string) => declared.has(key)
  const rank = (key: string) => {
    const i = DOMAIN_ORDER.indexOf(key)
    return i === -1 ? DOMAIN_ORDER.length : i
  }
  const keys = carried
    .filter((key) => byAnvil(key) || byViem(key))
    .sort((a, b) => rank(a) - rank(b))
  return {
    keys,
    disputed: keys.filter((key) => byAnvil(key) !== byViem(key)),
  }
}

function kernelWrapper(
  td: TypedDataInput,
  signed: { keys: string[]; disputed: string[] },
): Extract<DescribedTypedData, { kind: 'kernel-1271' }> | null {
  const { domain, types, primaryType, message } = td
  if (primaryType !== 'Kernel' || domain?.name !== 'Kernel') return null
  // Signed with exactly Kernel's domain, by every signer.
  if (
    signed.disputed.length > 0 ||
    signed.keys.length !== KERNEL_DOMAIN.length ||
    !KERNEL_DOMAIN.every((key) => signed.keys.includes(key))
  )
    return null
  const [field, ...rest] = types.Kernel ?? []
  if (rest.length > 0 || field?.name !== 'hash' || field.type !== 'bytes32')
    return null
  const { hash } = message
  const account = domain.verifyingContract
  const chainId = toDecimal(domain.chainId)
  if (
    !isHex(hash, { strict: true }) ||
    size(hash) !== 32 ||
    typeof account !== 'string' ||
    !isAddress(account, { strict: false }) ||
    chainId === null
  )
    return null
  return {
    kind: 'kernel-1271',
    account,
    innerHash: hash,
    chainId: Number(chainId),
    version: String(domain.version),
  }
}

/**
 * What a typed-data request asks to sign: Kernel's ERC-1271 wrapper, or the
 * domain fields that get signed (flagging those only some signers sign) and
 * the message's fields as dotted paths, with integers in decimal.
 */
export function describeTypedData(td: TypedDataInput): DescribedTypedData {
  const signed = signedDomain(td)
  const kernel = kernelWrapper(td, signed)
  if (kernel) return kernel
  const fields: TypedDataField[] = []
  walk(td.types, td.primaryType, td.message, '', fields)
  const domain = td.domain ?? {}
  return {
    kind: 'generic',
    primaryType: td.primaryType,
    domain: signed.keys.map((key) => [
      key,
      render(key === 'chainId' ? 'uint256' : '', domain[key]),
    ]),
    disputed: signed.disputed,
    fields,
  }
}
