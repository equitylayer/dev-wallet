import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { batchQueue } from '~/actions'
import { StartBatch } from '~/components/BatchBar'
import {
  ApprovalFrame,
  CallRow,
  Empty,
  Section,
  SendSummary,
} from '~/components/approval'
import * as styles from '~/components/approval/approval.css'
import { Box, Button, Text } from '~/design-system'
import { useSendPreview } from '~/hooks/useSendPreview'
import {
  type BatchQueue,
  type QueuedItem,
  flattenQueue,
  waitingSites,
} from '~/smart/queue'
import { truncate } from '~/utils'
import { locateCall, signAnyway } from '~/utils/sendPreview'
import { useAccountStore, useBatchQueue } from '~/zustand'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * The open batch (spec §7): its requests in order, each with its origin, to
 * reorder or drop; the whole batch simulated as one execution; then Sign or
 * Discard. With no batch open, "Start batch".
 */
export default function BatchReview() {
  const queue = useBatchQueue()
  const { account } = useAccountStore()
  const navigate = useNavigate()

  if (queue) return <Review queue={queue} />
  return (
    <ApprovalFrame title="Batch" onClose={() => navigate('/')}>
      <Empty>No batch is open.</Empty>
      {account && <StartBatch account={account} />}
    </ApprovalFrame>
  )
}

function Review({ queue }: { queue: BatchQueue }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const { items } = queue
  const calls = useMemo(() => flattenQueue(items), [items])
  const preview = useSendPreview({
    from: queue.account,
    calls,
    atomicRequired: true,
    method: 'wallet_sendCalls',
  })

  // Sign on the simulation of the batch as shown, never an earlier one.
  const simulating = preview.isLoading || preview.isPlaceholderData
  const current = simulating ? undefined : preview.data
  const failed =
    current && !current.simulation.ok
      ? locateCall(items, current.simulation.failedIndex)
      : null
  const anyway = signAnyway('wallet_sendCalls', current)
  const sites = waitingSites(items)

  async function sign() {
    setBusy(true)
    const signed = await batchQueue({
      action: 'sign',
      // What this screen shows: a batch that changed since is refused.
      reviewed: items.map((item) => item.requestId),
      ...(anyway && { force: true }),
    })
    setBusy(false)
    if (signed) {
      toast.success('Batch sent.')
      navigate('/')
    }
  }

  async function discard() {
    setBusy(true)
    const discarded = await batchQueue({ action: 'discard' })
    setBusy(false)
    if (discarded) navigate('/')
  }

  // Each request's first call, numbered across the batch like the simulation.
  const offsets = items.map((_, position) =>
    flattenQueue(items.slice(0, position)).length,
  )

  return (
    <ApprovalFrame
      title="Batch"
      subtitle={`${truncate(queue.account, { start: 6, end: 4 })} · ${plural(items.length, 'request')} · ${sites === 0 ? 'no site waiting' : `${plural(sites, 'site')} waiting`}`}
      onClose={() => navigate('/')}
      footer={
        <Box className={styles.actions}>
          <Box className={styles.fit}>
            <Button
              disabled={busy}
              height="28px"
              variant="stroked red"
              width="fit"
              onClick={discard}
            >
              Discard
            </Button>
          </Box>
          <Box className={styles.grow}>
            <Button
              disabled={busy || simulating || items.length === 0}
              height="28px"
              variant={anyway ? 'stroked red' : 'solid invert'}
              onClick={sign}
            >
              {anyway ? 'Sign anyway' : 'Sign batch'}
            </Button>
          </Box>
        </Box>
      }
    >
      {items.length === 0 ? (
        <Empty>
          The batch is empty. This account's sends join it: approve one with
          Add to batch, or with bypass on, they join on their own.
        </Empty>
      ) : (
        <>
          <SendSummary
            from={queue.account}
            method="wallet_sendCalls"
            preview={preview}
          />
          <Section
            title="Requests"
            aside={
              <Text color="text/tertiary" size="12px" wrap={false}>
                {plural(calls.length, 'call')}
              </Text>
            }
          >
            {items.map((item, position) => (
              <QueuedRequest
                key={item.requestId}
                item={item}
                position={position}
                last={position === items.length - 1}
                firstCall={offsets[position] ?? 0}
                failedCall={
                  failed?.itemIndex === position ? failed.callIndex : null
                }
                disabled={busy}
              />
            ))}
          </Section>
        </>
      )}
    </ApprovalFrame>
  )
}

/**
 * One request in the batch, with where it came from. A `wallet_sendCalls`
 * moves and leaves as a whole. Removing it rejects the site's request.
 */
function QueuedRequest({
  item,
  position,
  last,
  firstCall,
  failedCall,
  disabled,
}: {
  item: QueuedItem
  position: number
  last: boolean
  /** Its first call's number in the whole batch. */
  firstCall: number
  failedCall: number | null
  disabled: boolean
}) {
  const { requestId } = item
  const move = (to: number) => batchQueue({ action: 'move', requestId, to })

  return (
    <div className={styles.request}>
      <div className={styles.requestHeader}>
        <Box className={styles.grow}>
          <Box className={styles.inline}>
            <Box className={styles.shrink}>
              <Text size="13px" weight="medium" wrap={false}>
                {item.origin}
              </Text>
            </Box>
            <Box className={styles.fit}>
              <Text color="text/tertiary" family="mono" size="12px" wrap={false}>
                {item.method}
              </Text>
            </Box>
          </Box>
        </Box>
        <Box className={styles.tools}>
          <button
            type="button"
            aria-label="Move up"
            className={styles.toolButton}
            disabled={disabled || position === 0}
            onClick={() => move(position - 1)}
          >
            <ArrowUp size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label="Move down"
            className={styles.toolButton}
            disabled={disabled || last}
            onClick={() => move(position + 1)}
          >
            <ArrowDown size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label="Remove from the batch"
            title="Remove from the batch: the site's request is rejected"
            className={styles.toolButton}
            disabled={disabled}
            onClick={() => batchQueue({ action: 'remove', requestId })}
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        </Box>
      </div>
      {item.calls.map((call, index) => (
        <CallRow
          // A request's calls never change order.
          key={index}
          index={firstCall + index}
          call={call}
          failed={failedCall === index}
        />
      ))}
    </div>
  )
}
