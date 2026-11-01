import { Text } from '~/design-system'
import { useNetworkStatus } from '~/hooks/useNetworkStatus'
import { useAccountStore } from '~/zustand'

import { AccountPlate } from './AccountPlate'
import {
  ConnectedSection,
  RecentActivitySection,
  TokensSection,
} from './Sections'
import * as styles from './account-home.css'

/**
 * The Account desk: who DevWallet is acting as, what it holds, which dApps
 * can reach it, and what it did last.
 */
export function AccountHome() {
  const { account } = useAccountStore()
  const { data: online } = useNetworkStatus()

  if (!account || account.state !== 'loaded')
    return (
      <div className={styles.empty}>
        <Text color="text/secondary" size="13px">
          No account yet. Pick one from the strip above, or open All to
          impersonate an address.
        </Text>
      </div>
    )

  return (
    <div className={styles.scroll}>
      <AccountPlate account={account} online={Boolean(online)} />
      {/* Batch slot: the queued-calls bar sits here once batching ships
          (owned by the smart-accounts work). Renders nothing until then. */}
      <TokensSection address={account.address} />
      <ConnectedSection />
      <RecentActivitySection address={account.address} />
    </div>
  )
}
