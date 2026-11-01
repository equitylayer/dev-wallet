import type { Address } from 'viem'

import { Text } from '~/design-system'
import { useSendPreview } from '~/hooks/useSendPreview'
import type { RpcCall } from '~/smart/types'
import type { SendMethod } from '~/utils/sendPreview'
import type { PendingRequest } from '~/zustand/pending-requests'

import { SendActions } from './ApprovalActions'
import { ApprovalFrame } from './ApprovalFrame'
import { CallRow } from './CallRow'
import { SendSummary } from './SendSummary'
import { Empty, Section } from './parts'

const titles: Record<SendMethod, string> = {
  eth_sendTransaction: 'Send transaction',
  wallet_sendCalls: 'Send calls',
}

/**
 * The approval of a send (`eth_sendTransaction` or `wallet_sendCalls`): the
 * preview of the calls as one execution, the calls, and the decision.
 */
export function SendApproval({
  request,
  origin,
  method,
  from,
  calls,
  atomicRequired,
}: {
  request: PendingRequest
  origin?: string
  method: SendMethod
  from: Address
  calls: RpcCall[]
  atomicRequired: boolean
}) {
  const preview = useSendPreview({ from, calls, atomicRequired, method })
  const { data, isPlaceholderData } = preview
  const failedIndex =
    data && !isPlaceholderData && !data.simulation.ok
      ? data.simulation.failedIndex
      : null

  return (
    <ApprovalFrame
      title={titles[method]}
      subtitle={origin}
      footer={
        <SendActions
          request={request}
          method={method}
          from={from}
          calls={calls}
          preview={preview}
        />
      }
    >
      <SendSummary from={from} method={method} preview={preview} />
      <Section
        title="Calls"
        aside={
          <Text color="text/tertiary" size="12px" wrap={false}>
            {calls.length}
          </Text>
        }
      >
        {calls.length === 0 ? (
          <Empty>No calls.</Empty>
        ) : (
          calls.map((call, index) => (
            <CallRow
              // Calls have no identity of their own; their order is fixed.
              key={index}
              index={index}
              call={call}
              failed={index === failedIndex}
            />
          ))
        )}
      </Section>
    </ApprovalFrame>
  )
}
