import { Layers } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { batchQueue } from '~/actions'
import { Box, Button, Text } from '~/design-system'
import { useResolvedMode } from '~/hooks/useResolvedMode'
import { flattenQueue, waitingSites } from '~/smart/queue'
import { truncate } from '~/utils'
import type { BatchQueue } from '~/smart/queue'
import { useBatchQueue, useNetworkStore } from '~/zustand'
import type { Account } from '~/zustand/account'

import * as styles from './BatchBar.css'
import { ConfirmActions, useConfirm } from './Confirm'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * The open batch, wherever you are: its calls, how many sites wait on it (a
 * site that waits for one receipt before its next request stalls here), and
 * Review or Discard. Discarding rejects the waiting requests, so it asks
 * first. Nothing when no batch is open, and not on the review.
 */
export function BatchBar() {
  const queue = useBatchQueue()
  const { pathname } = useLocation()
  if (!queue || pathname === '/batch') return null
  // Another batch starts with no question pending.
  return <OpenBatch key={queue.openedAt} queue={queue} />
}

function OpenBatch({ queue }: { queue: BatchQueue }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const confirm = useConfirm()

  const requests = queue.items.length
  const calls = flattenQueue(queue.items).length
  const sites = waitingSites(queue.items)
  const account = truncate(queue.account, { start: 6, end: 4 })

  async function discard() {
    setBusy(true)
    await batchQueue({ action: 'discard' })
    setBusy(false)
    confirm.cancel()
  }

  return (
    <section aria-label="Open batch" className={styles.bar}>
      <Layers className={styles.icon} size={14} strokeWidth={1.75} />
      <Box className={styles.main}>
        <Text size="13px" weight="medium" wrap={false}>
          {`Batch · ${plural(calls, 'call')}`}
        </Text>
        <Box paddingTop="6px">
          <Text color="text/tertiary" size="12px" wrap={false}>
            {account} ·{' '}
            {sites === 0 ? 'no site waiting' : `${plural(sites, 'site')} waiting`}
          </Text>
        </Box>
      </Box>
      <Box className={styles.actions}>
        {confirm.asking ? (
          <ConfirmActions
            confirm={`Discard ${plural(requests, 'request')}`}
            disabled={busy}
            height="24px"
            onConfirm={discard}
            onCancel={confirm.cancel}
          />
        ) : (
          <>
            <Button
              disabled={busy}
              height="24px"
              variant="ghost red"
              width="fit"
              // An empty batch rejects nothing: no need to ask.
              onClick={requests > 0 ? confirm.ask : discard}
            >
              Discard
            </Button>
            {/* Secondary: the screen under the bar keeps its own primary. */}
            <Button
              height="24px"
              variant="stroked fill"
              width="fit"
              onClick={() => navigate('/batch')}
            >
              Review
            </Button>
          </>
        )}
      </Box>
    </section>
  )
}

/**
 * "Start batch": the batch bar's empty state, for a smart account with no
 * batch open. Its sends then wait in the batch until it is signed.
 */
export function StartBatch({ account }: { account: Account }) {
  const queue = useBatchQueue()
  const { network } = useNetworkStore()
  const mode = useResolvedMode(account.address)
  const [busy, setBusy] = useState(false)

  if (queue || mode !== 'smart') return null

  async function start() {
    setBusy(true)
    await batchQueue({
      action: 'open',
      rpcUrl: network.rpcUrl,
      account: account.address,
    })
    setBusy(false)
  }

  return (
    <section aria-label="Batch" className={styles.slot}>
      <Layers className={styles.icon} size={14} strokeWidth={1.75} />
      <Box className={styles.main}>
        <Text size="13px" weight="medium" wrap={false}>
          Batch
        </Text>
        <Box paddingTop="6px">
          <Text color="text/tertiary" size="12px">
            Queue this account's sends, then sign them as one transaction.
          </Text>
        </Box>
      </Box>
      <Box className={styles.actions}>
        <Button
          disabled={busy}
          height="24px"
          variant="stroked fill"
          width="fit"
          onClick={start}
        >
          Start batch
        </Button>
      </Box>
    </section>
  )
}
