import { Layers } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { batchQueue } from '~/actions'
import { Box, Button, Text } from '~/design-system'
import { useBytecode } from '~/hooks/useBytecode'
import { classifyCode } from '~/smart/kernel'
import { defaultMode } from '~/smart/mode-rules'
import { flattenQueue, waitingSites } from '~/smart/queue'
import type { AccountMode } from '~/smart/types'
import { truncate } from '~/utils'
import {
  accountModesStore,
  modeKey,
  useBatchQueue,
  useNetworkStore,
} from '~/zustand'
import type { Account } from '~/zustand/account'

import * as styles from './BatchBar.css'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * The open batch, wherever you are: its calls, how many sites wait on it (a
 * site that waits for one receipt before its next request stalls here), and
 * Review or Discard. Nothing when no batch is open, and not on the review.
 */
export function BatchBar() {
  const queue = useBatchQueue()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [busy, setBusy] = useState(false)

  if (!queue || pathname === '/batch') return null

  const calls = flattenQueue(queue.items).length
  const sites = waitingSites(queue.items)
  const account = truncate(queue.account, { start: 6, end: 4 })

  async function discard() {
    setBusy(true)
    await batchQueue({ action: 'discard' })
    setBusy(false)
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
        <Button
          disabled={busy}
          height="24px"
          variant="ghost red"
          width="fit"
          onClick={discard}
        >
          Discard
        </Button>
        <Button
          height="24px"
          variant="solid invert"
          width="fit"
          onClick={() => navigate('/batch')}
        >
          Review
        </Button>
      </Box>
    </section>
  )
}

/**
 * The account's mode as the background resolves it: the stored one, else the
 * default for its code. (Task 13's account-mode hook can take this over.)
 */
function useMode(account: Account): AccountMode | undefined {
  const { network } = useNetworkStore()
  const stored = useSyncExternalStore(
    accountModesStore.subscribe,
    () =>
      accountModesStore.getState().modes[
        modeKey(network.rpcUrl, account.address)
      ],
  )
  const impersonated = account.impersonate === true
  const { data: code, isSuccess } = useBytecode({ address: account.address })
  if (stored) return stored
  // Only an impersonated account's default depends on its code.
  if (impersonated && !isSuccess) return undefined
  return defaultMode({ impersonated, onchain: classifyCode(code ?? '0x') })
}

/**
 * "Start batch": the batch bar's empty state, for a smart account with no
 * batch open. Its sends then wait in the batch until it is signed.
 */
export function StartBatch({ account }: { account: Account }) {
  const queue = useBatchQueue()
  const { network } = useNetworkStore()
  const mode = useMode(account)
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
