import type { UseQueryResult } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import type { Address } from 'viem'

import { Box, Button, Text } from '~/design-system'
import { getMessenger } from '~/messengers'
import type { SendPreview } from '~/smart/preview'
import { flattenQueue } from '~/smart/queue'
import type { RpcCall } from '~/smart/types'
import { type SendMethod, sendActions } from '~/utils/sendPreview'
import { useBatchQueue, useNetworkStore } from '~/zustand'
import type { PendingRequest } from '~/zustand/pending-requests'

import * as styles from './approval.css'

const backgroundMessenger = getMessenger('background:wallet')

type Status = 'approved' | 'rejected' | 'batched'

/**
 * Sends the user's decision on a pending request. A refused one (an "Add to
 * batch" the background can't take) shows why, and the request stays.
 */
function useDecision(request: PendingRequest) {
  const [busy, setBusy] = useState(false)
  async function decide(status: Status, { force = false } = {}) {
    setBusy(true)
    try {
      await backgroundMessenger.send('pendingRequest', {
        request,
        status,
        ...(force && { force }),
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  return { busy, decide }
}

function RejectButton({
  disabled,
  onClick,
}: { disabled: boolean; onClick: () => void }) {
  return (
    <Box className={styles.fit}>
      <Button
        disabled={disabled}
        height="28px"
        variant="stroked fill"
        width="fit"
        onClick={onClick}
      >
        Reject
      </Button>
    </Box>
  )
}

/** Reject and Approve, for requests that only need a yes or no. */
export function DecisionActions({ request }: { request: PendingRequest }) {
  const { busy, decide } = useDecision(request)
  return (
    <Box className={styles.actions}>
      <RejectButton disabled={busy} onClick={() => decide('rejected')} />
      <Box className={styles.grow}>
        <Button
          disabled={busy}
          height="28px"
          variant="solid invert"
          onClick={() => decide('approved')}
        >
          Approve
        </Button>
      </Box>
    </Box>
  )
}

/**
 * A send's decision: Reject, "Add to batch" where the background takes it
 * (the lead action once a batch is open for the account), and Approve, which
 * reads "Sign anyway" and forces the send when the simulation expects a
 * revert. The buttons keep their places; only the emphasis moves.
 */
export function SendActions({
  request,
  method,
  from,
  calls,
  preview,
}: {
  request: PendingRequest
  method: SendMethod
  from: Address
  calls: readonly RpcCall[]
  preview: UseQueryResult<SendPreview>
}) {
  const queue = useBatchQueue()
  const { network } = useNetworkStore()
  const { busy, decide } = useDecision(request)

  // Decide on the preview of these calls, never one left from others.
  const simulating = preview.isLoading || preview.isPlaceholderData
  const current = simulating ? undefined : preview.data
  const actions = sendActions({
    method,
    preview: current,
    from,
    calls,
    rpcUrl: network.rpcUrl,
    queue,
  })
  const batchOpen = actions.primary === 'batch' && queue !== null
  const queuedCalls = queue ? flattenQueue(queue.items).length : 0

  return (
    <>
      {batchOpen && (
        <Box className={styles.footerNote}>
          <Text color="text/tertiary" size="12px">
            {`Batch open: ${queuedCalls} ${queuedCalls === 1 ? 'call' : 'calls'} so far.`}
            {current && !current.simulation.ok
              ? ' This send was simulated on its own; Review simulates the whole batch.'
              : ''}
          </Text>
        </Box>
      )}
      <Box className={styles.actions}>
        <RejectButton disabled={busy} onClick={() => decide('rejected')} />
        {actions.addToBatch && (
          <Box className={styles.grow}>
            <Button
              disabled={busy}
              height="28px"
              variant={batchOpen ? 'solid invert' : 'stroked fill'}
              onClick={() => decide('batched')}
            >
              Add to batch
            </Button>
          </Box>
        )}
        <Box className={styles.grow}>
          <Button
            disabled={busy || simulating}
            height="28px"
            variant={
              actions.signAnyway
                ? 'stroked red'
                : batchOpen
                  ? 'stroked fill'
                  : 'solid invert'
            }
            onClick={() =>
              decide('approved', { force: actions.signAnyway })
            }
          >
            {actions.signAnyway ? 'Sign anyway' : 'Approve'}
          </Button>
        </Box>
      </Box>
    </>
  )
}
