import { useMemo } from 'react'
import { type Address, hexToString, isHex, size, zeroAddress } from 'viem'

import {
  AddressLine,
  ApprovalFrame,
  DecisionActions,
  Notice,
  SendApproval,
  TypedDataView,
} from '~/components/approval'
import * as styles from '~/components/approval/approval.css'
import { Box, Text } from '~/design-system'
import { sendTransactionCall } from '~/smart/transaction-call'
import { type RpcCall, toRpcCall } from '~/smart/types'
import { useAccountStore } from '~/zustand'
import type { PendingRequest } from '~/zustand/pending-requests'

type ExtractRequest<Method extends string> = Extract<
  PendingRequest,
  { method: Method }
>

export default function PendingRequest_({
  request,
}: { request: PendingRequest }) {
  switch (request.method) {
    case 'wallet_sendCalls':
      return <SendCallsRequest request={request} />
    case 'eth_sendTransaction':
      return <SendTransactionRequest request={request} />
    case 'eth_sign':
      return <SignRequest request={request} />
    case 'personal_sign':
      return <SignMessageRequest request={request} />
    case 'eth_signTypedData_v4':
      return <SignTypedDataRequest request={request} />
    case 'eth_requestAccounts':
      return <RequestAccounts request={request} />
  }
  return null
}

/** Who asks: the site's host, or DevWallet for its own screens. */
function originOf(request: PendingRequest): string | undefined {
  const { sender } = request
  // `file://` pages report the opaque origin 'null'.
  const url =
    sender?.origin && sender.origin !== 'null' ? sender.origin : sender?.url
  if (!url) return undefined
  if (url.startsWith('chrome-extension://')) return 'DevWallet'
  try {
    return new URL(url).host.replace(/^www\./, '') || url
  } catch {
    return url
  }
}

////////////////////////////////////////////////////////////////////////
// Sends

/** A wallet_sendCalls call as the preview takes it: `to`, `value`, `data`. */
function rpcCall(call: unknown): RpcCall {
  const { to, value, data } = (call ?? {}) as Partial<RpcCall>
  return {
    ...(to && { to }),
    ...(value && { value }),
    ...(data && { data }),
  }
}

function SendCallsRequest({
  request,
}: { request: ExtractRequest<'wallet_sendCalls'> }) {
  const { account } = useAccountStore()
  const params = request.params?.[0] as
    | { from?: Address; calls?: unknown[]; atomicRequired?: boolean }
    | undefined
  const calls = useMemo(
    () => (Array.isArray(params?.calls) ? params.calls.map(rpcCall) : []),
    [request.params],
  )

  return (
    <SendApproval
      request={request}
      origin={originOf(request)}
      method="wallet_sendCalls"
      from={params?.from ?? account?.address ?? zeroAddress}
      calls={calls}
      atomicRequired={params?.atomicRequired === true}
    />
  )
}

function SendTransactionRequest({
  request,
}: { request: ExtractRequest<'eth_sendTransaction'> }) {
  const { account } = useAccountStore()
  const tx = request.params[0]
  // The call the background sends: a malformed one previews as no calls, and
  // approving it gets the dApp the background's error.
  const calls = useMemo(() => {
    try {
      return [toRpcCall(sendTransactionCall(tx))]
    } catch {
      return []
    }
  }, [tx])

  return (
    <SendApproval
      request={request}
      origin={originOf(request)}
      method="eth_sendTransaction"
      from={tx.from ?? account?.address ?? zeroAddress}
      calls={calls}
      atomicRequired={false}
    />
  )
}

////////////////////////////////////////////////////////////////////////
// Signatures: plain signatures by the account's key, in every mode

/**
 * `eth_sign`: bytes signed blind, with nothing to say what they are. The node
 * signs them as a personal message (EIP-191), which is how this account's
 * Kernel validator checks a user operation's hash: a 32-byte payload can be
 * one. So it warns before the payload, and Approve says what it does.
 */
function SignRequest({ request }: { request: ExtractRequest<'eth_sign'> }) {
  const [address, data] = request.params
  const hash = isHex(data) && size(data) === 32
  return (
    <ApprovalFrame
      title="Sign data"
      subtitle={originOf(request)}
      footer={
        <DecisionActions
          request={request}
          approve={hash ? 'Sign hash' : 'Sign data'}
          risky
        />
      }
    >
      <Box className={styles.block}>
        <AddressLine label="Account" address={address} />
        <Notice tone="red" title="Blind signature">
          <Text size="12px">
            eth_sign signs these bytes without saying what they are. A 32-byte
            hash signed this way can authorize anything that accepts a signed
            hash, such as a user operation of this account's smart account:
            it can move whatever the account holds. Sign only data you made
            yourself.
          </Text>
        </Notice>
        <Box paddingTop="16px">
          <Text color="text/tertiary" size="11px">
            {isHex(data) ? `Data · ${size(data)} bytes` : 'Data'}
          </Text>
          <Box className={styles.hexBox}>
            <Text family="mono" size="12px" wrap="anywhere">
              {data}
            </Text>
          </Box>
        </Box>
      </Box>
    </ApprovalFrame>
  )
}

function SignMessageRequest({
  request,
}: { request: ExtractRequest<'personal_sign'> }) {
  const [data, address] = request.params
  const message = useMemo(() => {
    try {
      return isHex(data) ? hexToString(data) : data
    } catch {
      return data
    }
  }, [data])

  return (
    <ApprovalFrame
      title="Sign message"
      subtitle={originOf(request)}
      footer={<DecisionActions request={request} />}
    >
      <Box className={styles.block}>
        <AddressLine label="Account" address={address} />
        <Box paddingTop="16px">
          <Text color="text/tertiary" size="11px">
            Message
          </Text>
          <Box className={styles.hexBox}>
            <Text size="13px" wrap="anywhere">
              {message}
            </Text>
          </Box>
        </Box>
      </Box>
    </ApprovalFrame>
  )
}

function SignTypedDataRequest({
  request,
}: { request: ExtractRequest<'eth_signTypedData_v4'> }) {
  const [address, data] = request.params
  return (
    <ApprovalFrame
      title="Sign typed data"
      subtitle={originOf(request)}
      footer={<DecisionActions request={request} />}
    >
      <Box className={styles.block}>
        <AddressLine label="Account" address={address} />
      </Box>
      <TypedDataView data={data} />
    </ApprovalFrame>
  )
}

////////////////////////////////////////////////////////////////////////
// Connection

function RequestAccounts({
  request,
}: { request: ExtractRequest<'eth_requestAccounts'> }) {
  const host = originOf(request)
  return (
    <ApprovalFrame
      title="Connect"
      subtitle={host}
      footer={<DecisionActions request={request} />}
    >
      <Box className={styles.block}>
        <Text color="text/secondary" size="14px">
          <Text color="text" weight="medium">
            {host ?? 'This site'}
          </Text>{' '}
          wants to connect to DevWallet.
        </Text>
        <Box paddingTop="12px">
          <Text color="text/secondary" size="14px">
            Once connected, it can see your account addresses and balances,
            and ask you to approve transactions and signatures.
          </Text>
        </Box>
      </Box>
    </ApprovalFrame>
  )
}
