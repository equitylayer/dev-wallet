import { WifiOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Box, Text } from '~/design-system'
import { useNetworkStore } from '~/zustand'

import * as styles from './shell.css'

/**
 * Inline and non-blocking: the last known state stays readable, and the
 * status line already disables what needs the node.
 */
export function OfflineBanner() {
  const { network } = useNetworkStore()
  const navigate = useNavigate()
  const host = network.rpcUrl.replace(/https?:\/\//, '')

  return (
    <div role="status" className={styles.offline}>
      <WifiOff className={styles.offlineIcon} size={14} strokeWidth={1.75} />
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Box className={styles.offlineTitle}>
          <Text size="13px" weight="semibold">
            Node offline
          </Text>
        </Box>
        <Box paddingTop="6px">
          <Text size="12px">
            {host} isn't responding. Showing the last known state; it
            reconnects on its own.
          </Text>
        </Box>
      </Box>
      <button
        type="button"
        className={styles.offlineAction}
        onClick={() => navigate('/networks')}
      >
        <Text size="12px" wrap={false}>
          Networks
        </Text>
      </button>
    </div>
  )
}
