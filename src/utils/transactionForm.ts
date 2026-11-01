// The `eth_sendTransaction` fields the approval screen shows and edits, in the
// units people type (ETH, gwei, decimals), and back to RPC hex. The approval
// sends the edited transaction back with the decision, and the background
// sends that one (`smart-sends.ts`). Pure, so it is unit-tested.
import {
  formatEther,
  formatGwei,
  isAddress,
  numberToHex,
  parseEther,
  parseGwei,
} from 'viem'

/** An `eth_sendTransaction` param, as the dApp sent it (RPC hex). */
export type RpcTransaction = Record<string, unknown>

/** The editable fields, in the order they are checked. */
export const TX_FIELDS = [
  'from',
  'to',
  'value',
  'data',
  'gas',
  'nonce',
  'maxPriorityFeePerGas',
  'maxFeePerGas',
  'gasPrice',
] as const

export type TxField = (typeof TX_FIELDS)[number]

/** The fields as typed: ETH, gwei and decimals; empty when absent. */
export type TxForm = Record<TxField, string>

/** The fields the node fills in when absent, and smart accounts ignore. */
export const GAS_FIELDS = [
  'gas',
  'nonce',
  'maxPriorityFeePerGas',
  'maxFeePerGas',
  'gasPrice',
] as const satisfies readonly TxField[]

export const TX_LABELS: Record<TxField, string> = {
  from: 'From',
  to: 'To',
  value: 'Value',
  data: 'Data',
  gas: 'Gas limit',
  nonce: 'Nonce',
  maxPriorityFeePerGas: 'Tip per gas',
  maxFeePerGas: 'Max fee per gas',
  gasPrice: 'Gas price',
}

const QUANTITY = /^0x[0-9a-f]+$/i
const WHOLE = /^\d+$/
const DECIMAL = /^(\d+\.?\d*|\.\d+)$/
const BYTES = /^0x([0-9a-f]{2})*$/i

/** A hex quantity (or a safe integer) as a bigint; anything else is null. */
export function quantity(value: unknown): bigint | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
    return BigInt(value)
  if (typeof value === 'string' && QUANTITY.test(value)) return BigInt(value)
  return null
}

type Unit = 'eth' | 'gwei' | 'whole'

const UNITS: Partial<Record<TxField, Unit>> = {
  value: 'eth',
  gas: 'whole',
  nonce: 'whole',
  maxPriorityFeePerGas: 'gwei',
  maxFeePerGas: 'gwei',
  gasPrice: 'gwei',
}

function show(value: unknown, unit: Unit | undefined): string {
  if (value === undefined || value === null) return ''
  const n = unit && quantity(value)
  // A malformed quantity shows as it came, for the node to refuse.
  if (n === null || n === undefined) return String(value)
  if (unit === 'eth') return formatEther(n)
  if (unit === 'gwei') return formatGwei(n)
  return n.toString()
}

/** The data key the dApp used: `data`, `input`, or both. */
function dataKeys(tx: RpcTransaction): ('data' | 'input')[] {
  if ('input' in tx && !('data' in tx)) return ['input']
  if ('input' in tx) return ['data', 'input']
  return ['data']
}

export function txForm(tx: RpcTransaction): TxForm {
  const form = {} as TxForm
  for (const field of TX_FIELDS) {
    const value = field === 'data' ? (tx.data ?? tx.input) : tx[field]
    form[field] = show(value, UNITS[field])
  }
  // No value sends nothing.
  if (form.value === '') form.value = '0'
  return form
}

/** A field's typed value as RPC hex, `undefined` to drop it, or why not. */
function parse(
  field: TxField,
  text: string,
  original: RpcTransaction,
): { value: string | undefined } | { error: string } {
  const label = TX_LABELS[field]
  switch (field) {
    case 'from':
    case 'to':
      if (text === '' && field === 'to' && original.to == null)
        return { value: undefined }
      return isAddress(text, { strict: false })
        ? { value: text }
        : { error: `${label} must be an address.` }
    case 'value':
      if (text === '') return { value: '0x0' }
      return DECIMAL.test(text)
        ? { value: numberToHex(parseEther(text)) }
        : { error: 'Value must be an amount of ETH, like 1 or 0.5.' }
    case 'data':
      if (text === '') return { value: '0x' }
      return BYTES.test(text)
        ? { value: text }
        : { error: 'Data must be hex bytes, like 0x or 0xa9059cbb.' }
    case 'gas':
    case 'nonce':
      if (text === '') return { value: undefined }
      return WHOLE.test(text)
        ? { value: numberToHex(BigInt(text)) }
        : { error: `${label} must be a whole number.` }
    default:
      if (text === '') return { value: undefined }
      return DECIMAL.test(text)
        ? { value: numberToHex(parseGwei(text)) }
        : { error: `${label} must be an amount of gwei, like 1.5.` }
  }
}

/**
 * The transaction with the form's edits, in RPC hex, or the first field that
 * isn't valid. Untouched fields stay exactly as the dApp sent them; cleared
 * gas, fee and nonce fields are dropped, for the node to fill in.
 */
export function applyTxForm(
  tx: RpcTransaction,
  form: TxForm,
): { tx: RpcTransaction } | { field: TxField; error: string } {
  const shown = txForm(tx)
  const next: RpcTransaction = { ...tx }
  for (const field of TX_FIELDS) {
    const text = form[field].trim()
    if (text === shown[field]) continue
    const parsed = parse(field, text, tx)
    if ('error' in parsed) return { field, error: parsed.error }
    const keys = field === 'data' ? dataKeys(tx) : [field]
    for (const key of keys) {
      if (parsed.value === undefined) delete next[key]
      else next[key] = parsed.value
    }
  }
  return { tx: next }
}

/** The fields whose values differ between the dApp's and the edited one. */
export function editedFields(
  original: RpcTransaction,
  edited: RpcTransaction,
): TxField[] {
  const before = txForm(original)
  const after = txForm(edited)
  return TX_FIELDS.filter((field) => before[field] !== after[field])
}
