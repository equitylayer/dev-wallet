import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { Toaster } from '~/components'
import { BatchBar } from '~/components/BatchBar'
import {
  AccountSwitcher,
  BottomNav,
  OfflineBanner,
  StatusLine,
} from '~/components/shell'
import { Box } from '~/design-system'
import { useNetworkStatus } from '~/hooks/useNetworkStatus'
import { useNetworkStore, usePendingRequestsStore } from '~/zustand'
import { getMessenger } from '../messengers'
import PendingRequest from './pending-request'
import { footer } from '~/components/shell/shell.css'
import * as styles from './_layout.css'

const backgroundMessenger = getMessenger('background:wallet')

export default function Layout() {
  const { network, onboarded } = useNetworkStore()
  const location = useLocation()
  const { data: online } = useNetworkStatus({ rpcUrl: network.rpcUrl })
  const navigate = useNavigate()
  const { pendingRequests } = usePendingRequestsStore()
  const pendingRequest = pendingRequests[pendingRequests.length - 1]
  const hasPendingRequest = pendingRequests.length > 0

  const isNetworkOffline = Boolean(network.rpcUrl && onboarded && !online)
  // The networks screen shows reachability per row; the banner would repeat it.
  const showOfflineBanner =
    isNetworkOffline && !location.pathname.startsWith('/networks')

  useEffect(() => {
    // On the extension channel, so only extension pages can drive navigation.
    return backgroundMessenger.reply('pushRoute', async (route) => {
      navigate(route)
      return
    })
  }, [])

  useEffect(() => {
    if (pendingRequests.length > 0) backgroundMessenger.send('ping', undefined)
  }, [])

  return (
    <Box
      backgroundColor="surface/primary/elevated"
      borderLeftWidth="1px"
      className={styles.shell}
    >
      <Toaster />
      {onboarded && <AccountSwitcher />}
      {showOfflineBanner && <OfflineBanner />}
      <Box className={styles.content}>
        {hasPendingRequest ? (
          <PendingRequest request={pendingRequest} />
        ) : (
          <Outlet />
        )}
      </Box>
      {onboarded && (
        <footer className={footer}>
          {!hasPendingRequest && <BatchBar />}
          {!hasPendingRequest && <BottomNav />}
          <StatusLine offline={isNetworkOffline} />
        </footer>
      )}
    </Box>
  )
}
