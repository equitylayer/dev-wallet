import { useEffect, useRef, useState } from 'react'

import { Box, Button, Input, Text } from '~/design-system'
import {
  type ExtraTxField,
  GAS_FIELDS,
  type RpcTransaction,
  TX_LABELS,
  type TxField,
  type TxForm,
  applyTxForm,
  carriesAuthorizations,
  editedFields,
  extraTxFields,
  txForm,
} from '~/utils/transactionForm'

import * as styles from './approval.css'
import { Notice, Readout, Section } from './parts'

const UNITS: Partial<Record<TxField, string>> = {
  value: 'ETH',
  maxPriorityFeePerGas: 'gwei',
  maxFeePerGas: 'gwei',
  gasPrice: 'gwei',
}

const groupIntl = new Intl.NumberFormat('en-US')

/** The gas fields to show: a legacy gas price only when one was sent. */
function gasFields(...txs: RpcTransaction[]): TxField[] {
  return GAS_FIELDS.filter(
    (field) => field !== 'gasPrice' || txs.some((tx) => tx.gasPrice != null),
  )
}

const SMART_NOTE =
  'Smart accounts ignore these: the path picks its own gas, fees and nonce.'

const EXTRAS_SENT_NOTE =
  'The node gets these as the dApp sent them. DevWallet does not edit them.'
const EXTRAS_DROPPED_NOTE =
  'A smart account sends only to, value and data: the node never gets these.'

/**
 * An `eth_sendTransaction`'s own fields: the gas limit, fees and nonce as the
 * dApp sent them (the node gets them as they are, unless the account is
 * smart), and Edit, which swaps them for inputs of every field, as the Account
 * plate's Edit state does. The approval sends the applied edits back. Every
 * other field the dApp sent follows, read-only (`ExtraFields`).
 */
export function TransactionFields({
  original,
  tx,
  smart,
  editing,
  onEdit,
  onApply,
  onCancel,
}: {
  /** The dApp's. */
  original: RpcTransaction
  /** As it will be sent. */
  tx: RpcTransaction
  /** The preview's account is smart. */
  smart: boolean
  editing: boolean
  onEdit: () => void
  onApply: (tx: RpcTransaction) => void
  onCancel: () => void
}) {
  const edited = editedFields(original, tx)
  const extras = extraTxFields(tx)
  // A plain account's transaction takes its authorization list to the node.
  const setsCode = carriesAuthorizations(tx) && !smart
  return (
    <Section
      title="Transaction"
      aside={
        <Box className={styles.inline}>
          {setsCode && (
            <Box
              className={styles.tagRed}
              title="Carries an EIP-7702 authorization list: it sets account code"
            >
              <Text size="11px" weight="medium" wrap={false}>
                Sets code
              </Text>
            </Box>
          )}
          {edited.length > 0 && (
            <Box
              className={styles.tag}
              title={`Edited: ${edited.map((f) => TX_LABELS[f]).join(', ')}`}
            >
              <Text size="11px" weight="medium" wrap={false}>
                Edited
              </Text>
            </Box>
          )}
          {!editing && (
            <Button
              height="24px"
              variant="stroked fill"
              width="fit"
              onClick={onEdit}
            >
              Edit
            </Button>
          )}
        </Box>
      }
    >
      <Box className={styles.block}>
        {editing ? (
          <EditState
            tx={tx}
            fields={gasFields(original, tx)}
            smart={smart}
            onApply={onApply}
            onCancel={onCancel}
          />
        ) : (
          <GasReadouts tx={tx} fields={gasFields(original, tx)} smart={smart} />
        )}
        {extras.length > 0 && (
          <ExtraFields fields={extras} setsCode={setsCode} smart={smart} />
        )}
      </Box>
    </Section>
  )
}

/**
 * The fields the dApp sent that have no field above (type, access list,
 * authorization list, chain id, blob fields, …), as sent. A plain account's
 * transaction takes every one to the node, so an EIP-7702 authorization list
 * is flagged in red (`setsCode`): it sets account code. A smart account's
 * drops them.
 */
function ExtraFields({
  fields,
  setsCode,
  smart,
}: { fields: ExtraTxField[]; setsCode: boolean; smart: boolean }) {
  return (
    <>
      {setsCode && (
        <Notice tone="red" title="This sets account code">
          <Text size="12px">
            The transaction carries an EIP-7702 authorization list. Each signed
            authorization in it sets its signer's code to the contract it
            names, and that contract then controls the account. Approve only a
            list you made yourself.
          </Text>
        </Notice>
      )}
      {fields.map(({ key, label, value }) => (
        <Box key={key} paddingTop="16px">
          <Text color="text/tertiary" size="11px">
            {label}
          </Text>
          <Box className={styles.hexBox}>
            <Text family="mono" size="12px" wrap="anywhere">
              {value}
            </Text>
          </Box>
        </Box>
      ))}
      <Box paddingTop="12px">
        <Text color="text/tertiary" size="12px">
          {smart ? EXTRAS_DROPPED_NOTE : EXTRAS_SENT_NOTE}
        </Text>
      </Box>
    </>
  )
}

/** The gas limit, nonce and fees as they will be sent; "Auto" for the node's. */
function GasReadouts({
  tx,
  fields,
  smart,
}: { tx: RpcTransaction; fields: TxField[]; smart: boolean }) {
  const form = txForm(tx)
  return (
    <>
      <Box className={styles.fieldGrid}>
        {fields.map((field) => {
          const value = form[field]
          const shown =
            (field === 'gas' || field === 'nonce') && /^\d+$/.test(value)
              ? field === 'gas'
                ? groupIntl.format(BigInt(value))
                : value
              : value
          return (
            <Readout key={field} label={TX_LABELS[field]}>
              {value === '' ? (
                <Box className={styles.shrink} title="The node fills it in">
                  <Text color="text/tertiary" size="14px" wrap={false}>
                    Auto
                  </Text>
                </Box>
              ) : (
                <>
                  <Box className={styles.shrink}>
                    <Text family="mono" size="14px" tabular wrap={false}>
                      {shown}
                    </Text>
                  </Box>
                  {UNITS[field] && (
                    <Box className={styles.fit}>
                      <Text color="text/tertiary" size="11px" wrap={false}>
                        {UNITS[field]}
                      </Text>
                    </Box>
                  )}
                </>
              )}
            </Readout>
          )
        })}
      </Box>
      {smart && (
        <Box paddingTop="12px">
          <Text color="text/tertiary" size="12px">
            {SMART_NOTE}
          </Text>
        </Box>
      )}
    </>
  )
}

const label = (field: TxField) =>
  UNITS[field] ? `${TX_LABELS[field]} (${UNITS[field]})` : TX_LABELS[field]

/** Every field as a 24px input; Apply checks them all, Cancel drops them. */
function EditState({
  tx,
  fields,
  smart,
  onApply,
  onCancel,
}: {
  tx: RpcTransaction
  fields: TxField[]
  smart: boolean
  onApply: (tx: RpcTransaction) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<TxForm>(() => txForm(tx))
  const [invalid, setInvalid] = useState<{ field: TxField; error: string }>()
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => firstRef.current?.focus(), [])

  const apply = () => {
    const result = applyTxForm(tx, form)
    if ('error' in result) setInvalid(result)
    else onApply(result.tx)
  }

  const input = (field: TxField, options: { mono?: boolean } = {}) => (
    <Box className={options.mono ? styles.monoInput : styles.fieldInput}>
      <Input
        ref={field === 'from' ? firstRef : undefined}
        aria-label={label(field)}
        aria-invalid={invalid?.field === field}
        height="24px"
        inputMode={
          field === 'gas' || field === 'nonce'
            ? 'numeric'
            : UNITS[field]
              ? 'decimal'
              : undefined
        }
        placeholder={
          field === 'to'
            ? 'None: a deployment'
            : (GAS_FIELDS as readonly string[]).includes(field)
              ? 'Auto'
              : undefined
        }
        spellCheck={false}
        state={invalid?.field === field ? 'error' : undefined}
        value={form[field]}
        onChange={(e) => setForm({ ...form, [field]: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply()
          if (e.key === 'Escape') onCancel()
        }}
      />
    </Box>
  )

  return (
    <>
      {(['from', 'to', 'value', 'data'] as const).map((field) => (
        <Box key={field} className={styles.field}>
          <Text color="text/tertiary" size="11px">
            {label(field)}
          </Text>
          {input(field, { mono: field !== 'value' })}
        </Box>
      ))}
      <Box className={styles.fieldGrid}>
        {fields.map((field) => (
          <Readout key={field} label={label(field)}>
            {input(field)}
          </Readout>
        ))}
      </Box>
      {smart && (
        <Box paddingTop="12px">
          <Text color="text/tertiary" size="12px">
            {SMART_NOTE}
          </Text>
        </Box>
      )}
      {invalid && (
        <Box paddingTop="12px">
          <Text color="surface/red" size="12px">
            {invalid.error}
          </Text>
        </Box>
      )}
      <Box className={styles.editActions}>
        <Button height="28px" variant="solid invert" width="fit" onClick={apply}>
          Apply
        </Button>
        <Button
          height="28px"
          variant="stroked fill"
          width="fit"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Box className={styles.grow}>
          <Text color="text/tertiary" size="12px" wrap={false}>
            Enter applies, Esc cancels
          </Text>
        </Box>
      </Box>
    </>
  )
}
