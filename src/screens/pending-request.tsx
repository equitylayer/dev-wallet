import { useMemo, useState } from 'react'
import { type Address, size, zeroAddress } from 'viem'

import {
  AddressLine,
  ApprovalFrame,
  DecisionActions,
  SendApproval,
  SignNotice,
  TransactionFields,
  TypedDataView,
} from '~/components/approval'
import * as styles from '~/components/approval/approval.css'
import { Box, Text } from '~/design-system'
import { dropsExtras, sendTransactionCall } from '~/smart/transaction-call'
import { type RpcCall, toRpcCall } from '~/smart/types'
import { asSent } from '~/utils/asSent'
import { normalizeHost } from '~/utils/host'
import {
  canonicalParams,
  payloadBytes,
  readableText,
  signNotice,
} from '~/utils/signRequest'
import type { RpcTransaction } from '~/utils/transactionForm'
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
    return normalizeHost(new URL(url).host) || url
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

/**
 * An `eth_sendTransaction`, editable before it is decided. The edits stay
 * here; the decision sends the edited transaction back, and the background
 * sends that one (for a smart account, only its from, to, value and data
 * count). The preview simulates the transaction as it will be sent.
 */
function SendTransactionRequest({
  request,
}: { request: ExtractRequest<'eth_sendTransaction'> }) {
  const [param] = (request.params ?? []) as unknown[]
  // A malformed one edits as an empty transaction.
  const original = useMemo(
    () =>
      (typeof param === 'object' && param !== null
        ? param
        : {}) as RpcTransaction,
    [param],
  )
  const [tx, setTx] = useState(original)
  const [editing, setEditing] = useState(false)
  // The call the background sends: a malformed one previews as no calls, and
  // approving it gets the dApp the background's error.
  const calls = useMemo(() => {
    try {
      return [toRpcCall(sendTransactionCall(tx))]
    } catch {
      return []
    }
  }, [tx])
  // Unedited, the request goes back exactly as the dApp sent it.
  const decided = useMemo(
    () =>
      tx === original
        ? request
        : ({ ...request, params: [tx] } as PendingRequest),
    [request, tx, original],
  )

  return (
    <SendApproval
      request={decided}
      origin={originOf(request)}
      method="eth_sendTransaction"
      // A page's transaction always names its account: the background gives
      // one with none the active account (R50), and the wallet's own name
      // theirs. Without one it is no account's, never the active one's.
      from={typeof tx.from === 'string' ? (tx.from as Address) : zeroAddress}
      calls={calls}
      atomicRequired={false}
      tx={tx}
      editing={editing}
      transaction={(preview) => (
        <TransactionFields
          original={original}
          tx={tx}
          // The background's rule, on the mode the preview has now: while
          // it is pending, failed or a placeholder, nothing counts as dropped.
          dropped={
            !preview.isPlaceholderData && dropsExtras(tx, preview.data?.mode)
          }
          editing={editing}
          onEdit={() => setEditing(true)}
          onApply={(edited) => {
            setTx(edited)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    />
  )
}

////////////////////////////////////////////////////////////////////////
// Signatures: plain signatures by the account's key, in every mode

/**
 * The request as the decision forwards it: its payload as the 0x-prefixed
 * bytes the screen shows, so what is shown is what gets signed.
 */
function useCanonical<R extends ExtractRequest<'eth_sign' | 'personal_sign'>>(
  request: R,
): R {
  return useMemo(() => {
    const params = canonicalParams(request.method, request.params)
    return params === request.params ? request : { ...request, params }
  }, [request])
}

/**
 * `eth_sign`: the node signs the bytes as a personal message (EIP-191
 * prefixed), as for `personal_sign`. A 32-byte payload looks like a hash, and
 * a contract that checks a hash signed that way (Kernel's validator, for a
 * user operation) accepts it: that gets a warning, and Approve says what it
 * does.
 */
function SignRequest({ request }: { request: ExtractRequest<'eth_sign'> }) {
  const [address, data] = request.params
  const bytes = payloadBytes(data)
  const notice = signNotice('eth_sign', data)
  const decided = useCanonical(request)
  return (
    <ApprovalFrame
      title="Sign data"
      subtitle={originOf(request)}
      footer={
        <DecisionActions
          request={decided}
          {...(notice === 'hash' && { approve: 'Sign hash', risky: true })}
        />
      }
    >
      <Box className={styles.block}>
        <AddressLine label="Account" address={address} />
        {notice === 'hash' && <SignNotice kind="hash" />}
        <Box paddingTop="16px">
          <Text color="text/tertiary" size="11px">
            {bytes === null ? 'Data' : `Data · ${size(bytes)} bytes`}
          </Text>
          <Box className={styles.hexBox}>
            <Text family="mono" size="12px" wrap="anywhere">
              {bytes ?? asSent(data)}
            </Text>
          </Box>
        </Box>
        {notice !== 'hash' && <SignNotice kind={notice} />}
      </Box>
    </ApprovalFrame>
  )
}

/**
 * `personal_sign`: the message as text, when its bytes are plain UTF-8, else
 * as hex. One that looks like a hash shows as hex under the same warning as
 * `eth_sign`'s: it is the same signature.
 */
function SignMessageRequest({
  request,
}: { request: ExtractRequest<'personal_sign'> }) {
  const [data, address] = request.params
  const bytes = payloadBytes(data)
  const notice = signNotice('personal_sign', data)
  const hash = notice === 'hash'
  const text = useMemo(
    () => (bytes !== null && !hash ? readableText(bytes) : null),
    [bytes, hash],
  )
  const decided = useCanonical(request)
  const label = hash
    ? 'Hash · 32 bytes'
    : bytes === null
      ? 'Message'
      : `${text === null ? 'Data' : 'Message'} · ${size(bytes)} bytes`
  const hex = bytes !== null && text === null

  return (
    <ApprovalFrame
      title="Sign message"
      subtitle={originOf(request)}
      footer={
        <DecisionActions
          request={decided}
          {...(hash && { approve: 'Sign hash', risky: true })}
        />
      }
    >
      <Box className={styles.block}>
        <AddressLine label="Account" address={address} />
        {hash && <SignNotice kind="hash" />}
        <Box paddingTop="16px">
          <Text color="text/tertiary" size="11px">
            {label}
          </Text>
          <Box className={styles.hexBox}>
            <Text
              family={hex ? 'mono' : undefined}
              size={hex ? '12px' : '13px'}
              wrap="anywhere"
            >
              {text ?? bytes ?? asSent(data)}
            </Text>
          </Box>
        </Box>
        {!hash && <SignNotice kind={notice} />}
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
