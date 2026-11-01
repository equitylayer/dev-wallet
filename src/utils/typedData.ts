// Typed data (`eth_signTypedData_v4`) for the approval screen: structured
// fields instead of raw JSON, and Kernel's ERC-1271 wrapper named for what it
// is (spec §8). Pure, so it is unit-tested.
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
    }
  | {
      kind: 'generic'
      primaryType: string
      /** The domain's fields, in EIP-712 order, then any others. */
      domain: [string, string][]
      fields: TypedDataField[]
    }

const DOMAIN_ORDER = ['name', 'version', 'chainId', 'verifyingContract', 'salt']
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

function kernelWrapper(
  td: TypedDataInput,
): Extract<DescribedTypedData, { kind: 'kernel-1271' }> | null {
  const { domain, types, primaryType, message } = td
  if (primaryType !== 'Kernel' || domain?.name !== 'Kernel') return null
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
  }
}

function domainEntries(domain: Record<string, unknown> = {}): [string, string][] {
  const rank = (key: string) => {
    const i = DOMAIN_ORDER.indexOf(key)
    return i === -1 ? DOMAIN_ORDER.length : i
  }
  return Object.keys(domain)
    .filter((key) => domain[key] !== undefined)
    .sort((a, b) => rank(a) - rank(b))
    .map((key) => [
      key,
      render(key === 'chainId' ? 'uint256' : '', domain[key]),
    ])
}

/**
 * What a typed-data request asks to sign: Kernel's ERC-1271 wrapper, or the
 * message's fields as dotted paths, with integers in decimal.
 */
export function describeTypedData(td: TypedDataInput): DescribedTypedData {
  const kernel = kernelWrapper(td)
  if (kernel) return kernel
  const fields: TypedDataField[] = []
  walk(td.types, td.primaryType, td.message, '', fields)
  return {
    kind: 'generic',
    primaryType: td.primaryType,
    domain: domainEntries(td.domain),
    fields,
  }
}
