import { useMemo } from 'react'

import { Box, Text } from '~/design-system'
import {
  type DescribedTypedData,
  type TypedDataInput,
  describeTypedData,
} from '~/utils/typedData'

import * as styles from './approval.css'
import { Empty, Notice, Section } from './parts'

/** Typed data comes as JSON, though some dApps send the object itself. */
function parse(data: unknown): DescribedTypedData | null {
  try {
    const td = (
      typeof data === 'string' ? JSON.parse(data) : data
    ) as TypedDataInput
    if (typeof td !== 'object' || td === null || !td.types) return null
    return describeTypedData({ ...td, message: td.message ?? {} })
  } catch {
    return null
  }
}

/** Typed data as what it means: Kernel's ERC-1271 wrapper, or its fields. */
export function TypedDataView({ data }: { data: unknown }) {
  const described = useMemo(() => parse(data), [data])

  if (!described)
    return (
      <Section title="Data">
        <Box className={styles.block}>
          <Text color="text/secondary" size="12px">
            Not valid typed data; shown as sent.
          </Text>
          <Box className={styles.hexBox}>
            <Text family="mono" size="12px" wrap="anywhere">
              {typeof data === 'string' ? data : JSON.stringify(data)}
            </Text>
          </Box>
        </Box>
      </Section>
    )

  if (described.kind === 'kernel-1271')
    return (
      <Section title="Kernel signature">
        <Box className={styles.block}>
          <Text size="14px">
            ERC-1271 signature for Kernel account{' '}
            <Text family="mono" size="12px" wrap="anywhere">
              {described.account}
            </Text>
            , inner hash{' '}
            <Text family="mono" size="12px" wrap="anywhere">
              {described.innerHash}
            </Text>
          </Text>
          <Box paddingTop="12px">
            <Text color="text/tertiary" size="12px">
              Kernel {described.version}, chain {described.chainId}. DevWallet
              signs it with the account's key, as a plain signature.
            </Text>
          </Box>
        </Box>
      </Section>
    )

  const { disputed } = described
  return (
    <>
      <Section title="Domain">
        {disputed.length > 0 && (
          <Box paddingHorizontal="12px" paddingBottom="12px">
            <Notice tone="yellow" title="Signers disagree on this domain">
              <Text size="12px">
                {`EIP712Domain doesn't match the domain on ${disputed.join(', ')}. Anvil signs the standard fields the domain carries; viem and MetaMask sign the declared ones. A contract may check a different domain than the one signed.`}
              </Text>
            </Notice>
          </Box>
        )}
        {described.domain.length === 0 ? (
          <Empty>No domain.</Empty>
        ) : (
          described.domain.map(([key, value]) => (
            <Field
              key={key}
              path={key}
              value={value}
              disputed={disputed.includes(key)}
            />
          ))
        )}
      </Section>
      <Section
        title="Message"
        aside={
          <Text color="text/tertiary" family="mono" size="12px" wrap={false}>
            {described.primaryType}
          </Text>
        }
      >
        {described.fields.length === 0 ? (
          <Empty>No fields.</Empty>
        ) : (
          described.fields.map((field) => (
            <Field
              key={field.path}
              path={field.path}
              type={field.type}
              value={field.value}
            />
          ))
        )}
      </Section>
    </>
  )
}

/**
 * A field over its value: values run long, so they get the full width. A
 * `disputed` domain field is signed by some signers only.
 */
function Field({
  path,
  type,
  value,
  disputed = false,
}: { path: string; type?: string; value: string; disputed?: boolean }) {
  return (
    <Box className={styles.row}>
      <Box className={styles.grow}>
        <Box className={styles.inline}>
          <Box className={styles.shrink}>
            <Text color="text/secondary" family="mono" size="12px" wrap={false}>
              {path}
            </Text>
          </Box>
          {type && (
            <Box className={styles.fit}>
              <Text color="text/tertiary" family="mono" size="11px" wrap={false}>
                {type}
              </Text>
            </Box>
          )}
          {disputed && (
            <Box className={styles.tagYellow}>
              <Text size="11px" weight="medium" wrap={false}>
                Not signed by all
              </Text>
            </Box>
          )}
        </Box>
        <Box paddingTop="6px">
          <Text family="mono" size="12px" wrap="anywhere">
            {value === '' ? '—' : value}
          </Text>
        </Box>
      </Box>
    </Box>
  )
}
