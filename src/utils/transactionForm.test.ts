import { describe, expect, test } from 'bun:test'

import {
  applyTxForm,
  editedFields,
  quantity,
  txForm,
} from './transactionForm'

const FROM = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const TO = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'

// As a dApp sends it: RPC hex.
const dappTx = () => ({
  from: FROM,
  to: TO,
  value: '0xde0b6b3a7640000', // 1 ETH
  data: '0xa9059cbb',
  gas: '0x5208', // 21,000
  maxPriorityFeePerGas: '0x3b9aca00', // 1 gwei
  maxFeePerGas: '0x77359400', // 2 gwei
  nonce: '0x7',
  chainId: '0x7a69',
})

describe('quantity', () => {
  test('hex quantities and safe integers; anything else is null', () => {
    expect(quantity('0x5208')).toBe(21_000n)
    expect(quantity(7)).toBe(7n)
    expect(quantity('21000')).toBeNull()
    expect(quantity('0x')).toBeNull()
    expect(quantity(undefined)).toBeNull()
  })
})

describe('txForm', () => {
  test('the fields in the units people type: ETH, gwei and decimals', () => {
    expect(txForm(dappTx())).toEqual({
      from: FROM,
      to: TO,
      value: '1',
      data: '0xa9059cbb',
      gas: '21000',
      nonce: '7',
      maxPriorityFeePerGas: '1',
      maxFeePerGas: '2',
      gasPrice: '',
    })
  })

  test("absent fields are empty: the node fills them in; `input` reads as data", () => {
    expect(txForm({ from: FROM, input: '0x01' })).toEqual({
      from: FROM,
      to: '',
      value: '0',
      data: '0x01',
      gas: '',
      nonce: '',
      maxPriorityFeePerGas: '',
      maxFeePerGas: '',
      gasPrice: '',
    })
  })

  test('a malformed quantity shows as it came', () => {
    expect(txForm({ from: FROM, gas: 'lots' }).gas).toBe('lots')
  })
})

describe('applyTxForm', () => {
  test('an untouched form gives back the transaction as it was', () => {
    const tx = dappTx()
    expect(applyTxForm(tx, txForm(tx))).toEqual({ tx })
  })

  test('edits go back as RPC hex; other fields stay', () => {
    const tx = dappTx()
    const result = applyTxForm(tx, {
      ...txForm(tx),
      value: '0.5',
      gas: '50000',
      maxFeePerGas: '3.5',
      nonce: '8',
      data: '0x',
    })
    expect(result).toEqual({
      tx: {
        ...tx,
        value: '0x6f05b59d3b20000',
        gas: '0xc350',
        maxFeePerGas: '0xd09dc300',
        nonce: '0x8',
        data: '0x',
      },
    })
  })

  test('clearing gas, fees or nonce leaves them to the node', () => {
    const tx = dappTx()
    const result = applyTxForm(tx, {
      ...txForm(tx),
      gas: '',
      maxPriorityFeePerGas: ' ',
      maxFeePerGas: '',
      nonce: '',
    })
    expect(result).toEqual({
      tx: { from: FROM, to: TO, value: tx.value, data: tx.data, chainId: tx.chainId },
    })
  })

  test('data edits follow the key the dApp used', () => {
    const tx = { from: FROM, to: TO, input: '0x01' }
    expect(applyTxForm(tx, { ...txForm(tx), data: '0x02' })).toEqual({
      tx: { from: FROM, to: TO, input: '0x02' },
    })
  })

  test('a deployment may stay without `to`; a call may not lose it', () => {
    const deploy = { from: FROM, data: '0x6080' }
    expect(applyTxForm(deploy, txForm(deploy))).toEqual({ tx: deploy })
    expect(applyTxForm(dappTx(), { ...txForm(dappTx()), to: '' })).toEqual({
      field: 'to',
      error: 'To must be an address.',
    })
  })

  test('the first invalid field, with what it needs', () => {
    const form = txForm(dappTx())
    const cases = [
      [{ from: '0x1234' }, 'from', 'From must be an address.'],
      [{ value: '-1' }, 'value', 'Value must be an amount of ETH, like 1 or 0.5.'],
      [{ data: '0xabc' }, 'data', 'Data must be hex bytes, like 0x or 0xa9059cbb.'],
      [{ gas: '1.5' }, 'gas', 'Gas limit must be a whole number.'],
      [{ nonce: '-2' }, 'nonce', 'Nonce must be a whole number.'],
      [{ maxFeePerGas: 'x' }, 'maxFeePerGas', 'Max fee per gas must be an amount of gwei, like 1.5.'],
    ] as const
    for (const [edit, field, error] of cases) {
      expect(applyTxForm(dappTx(), { ...form, ...edit })).toEqual({ field, error })
    }
  })
})

describe('editedFields', () => {
  test('the fields that differ from the dApp\'s, by value', () => {
    const tx = dappTx()
    expect(editedFields(tx, tx)).toEqual([])
    expect(
      editedFields(tx, { ...tx, gas: '0xc350', nonce: undefined, value: '0x0de0b6b3a7640000' }),
    ).toEqual(['gas', 'nonce'])
  })
})
