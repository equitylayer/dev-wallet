// The transaction details' sections for smart-account transactions: an
// EIP-7702 transaction's authorizations, and the user operations a
// `handleOps` transaction ran.
import type { ReactNode } from 'react'
import {
  type Address,
  type Hash,
  type SignedAuthorizationList,
  isAddressEqual,
  zeroAddress,
} from 'viem'

import { CallRow, Readout } from '~/components/approval'
import * as styles from '~/components/approval/approval.css'
import { Bleed, Box, Text } from '~/design-system'
import { useAuthorities } from '~/hooks/useAuthorities'
import { DEVWALLET_PAYMASTER, KERNEL_V3_3 } from '~/smart/constants'
import type { UserOpSummary } from '~/smart/decode'
import { toRpcCall } from '~/smart/types'
import { truncate } from '~/utils'
import { ethAmount } from '~/utils/sendPreview'

import * as local from './transaction-details-smart.css'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function SmartSection({
  title,
  count,
  children,
}: { title: string; count: string; children: ReactNode }) {
  return (
    <Bleed horizontal="-8px">
      <section aria-label={title}>
        <header className={styles.sectionHeader}>
          <Box className={styles.shrink}>
            <Text as="h2" size="13px" weight="medium" wrap={false}>
              {title}
            </Text>
          </Box>
          <Text color="text/tertiary" size="12px" wrap={false}>
            {count}
          </Text>
        </header>
        {children}
      </section>
    </Bleed>
  )
}

/** A middle-truncated address, the full one in its title, and a name. */
function AddressValue({ address, name }: { address: Address; name?: string }) {
  return (
    <>
      <Box title={address}>
        <Text family="mono" size="12px" tabular wrap={false}>
          {truncate(address, { start: 6, end: 4 })}
        </Text>
      </Box>
      {name && (
        <Text color="text/tertiary" size="11px" wrap={false}>
          {name}
        </Text>
      )}
    </>
  )
}

////////////////////////////////////////////////////////////////////////
// EIP-7702 authorizations

export function Authorizations({
  transaction,
}: {
  transaction: {
    hash: Hash
    authorizationList: SignedAuthorizationList
  }
}) {
  const { authorizationList } = transaction
  const { data: authorities, isError } = useAuthorities(transaction)

  return (
    <SmartSection
      title="Authorizations"
      count={plural(authorizationList.length, 'authorization')}
    >
      {authorizationList.map((authorization, index) => {
        const authority = authorities?.[index]
        const revokes = isAddressEqual(authorization.address, zeroAddress)
        return (
          <Box
            // The list is fixed once the transaction is signed.
            key={index}
            className={local.block}
          >
            <Box className={styles.fieldGrid}>
              <Readout label="Authority">
                {authority ? (
                  <AddressValue address={authority} />
                ) : authority === null || isError ? (
                  <Text color="surface/red" size="12px" wrap={false}>
                    Signature doesn't recover
                  </Text>
                ) : (
                  <Text color="text/tertiary" size="12px" wrap={false}>
                    Recovering…
                  </Text>
                )}
              </Readout>
              <Readout label="Delegates to">
                {revokes ? (
                  <Text size="12px" wrap={false}>
                    None (clears delegation)
                  </Text>
                ) : (
                  <AddressValue
                    address={authorization.address}
                    name={
                      isAddressEqual(authorization.address, KERNEL_V3_3)
                        ? 'Kernel v3.3'
                        : undefined
                    }
                  />
                )}
              </Readout>
              <Readout label="Chain id">
                <Text family="mono" size="12px" tabular wrap={false}>
                  {authorization.chainId}
                </Text>
                {authorization.chainId === 0 && (
                  <Text color="text/tertiary" size="11px" wrap={false}>
                    any chain
                  </Text>
                )}
              </Readout>
              <Readout label="Nonce">
                <Text family="mono" size="12px" tabular wrap={false}>
                  {authorization.nonce}
                </Text>
              </Readout>
            </Box>
          </Box>
        )
      })}
    </SmartSection>
  )
}

////////////////////////////////////////////////////////////////////////
// User operations

export function UserOperations({ ops }: { ops: UserOpSummary[] }) {
  return (
    <SmartSection
      title="User operations"
      count={plural(ops.length, 'operation')}
    >
      {ops.length === 0 && (
        <Box className={styles.empty}>
          <Text color="text/secondary" size="12px">
            This handleOps ran no operations.
          </Text>
        </Box>
      )}
      {ops.map((op) => (
        <UserOperation key={`${op.sender}-${op.nonce}`} op={op} />
      ))}
    </SmartSection>
  )
}

function UserOperation({ op }: { op: UserOpSummary }) {
  const gasCost = ethAmount(op.actualGasCost)
  return (
    <div className={styles.request}>
      <div className={styles.requestHeader}>
        <Box className={styles.grow}>
          <Box className={styles.inline}>
            <Box className={styles.fit}>
              <Text color="text/tertiary" size="12px" wrap={false}>
                Sender
              </Text>
            </Box>
            <Box className={styles.shrink} title={op.sender}>
              <Text family="mono" size="12px" tabular wrap={false}>
                {truncate(op.sender, { start: 6, end: 4 })}
              </Text>
            </Box>
            <Box className={op.success ? styles.tagGreen : styles.tagRed}>
              <Text size="11px" weight="medium" wrap={false}>
                {op.success ? 'Succeeded' : 'Reverted'}
              </Text>
            </Box>
          </Box>
        </Box>
      </div>
      <Box className={local.block}>
        <Box className={styles.fieldGrid}>
          <Readout label="Paymaster">
            {isAddressEqual(op.paymaster, zeroAddress) ? (
              <Text size="12px" wrap={false}>
                None
              </Text>
            ) : (
              <AddressValue
                address={op.paymaster}
                name={
                  isAddressEqual(op.paymaster, DEVWALLET_PAYMASTER)
                    ? 'DevWallet'
                    : undefined
                }
              />
            )}
          </Readout>
          <Readout label="Actual gas cost">
            <Text family="mono" size="12px" tabular wrap={false}>
              {gasCost.amount}
            </Text>
            <Text color="text/tertiary" size="11px" wrap={false}>
              {gasCost.unit}
            </Text>
          </Readout>
          <Readout label="Nonce">
            <Text family="mono" size="12px" tabular wrap={false}>
              {op.nonce.toString()}
            </Text>
          </Readout>
        </Box>
      </Box>
      {op.calls ? (
        op.calls.map((call, index) => (
          <CallRow
            // An operation's calls never change order.
            key={index}
            index={index}
            call={toRpcCall(call)}
          />
        ))
      ) : (
        <Box className={styles.empty}>
          <Text color="text/secondary" size="12px">
            Its call data isn't a Kernel batch, so its calls aren't shown.
          </Text>
        </Box>
      )}
    </div>
  )
}
