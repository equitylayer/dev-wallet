import { StartBatch } from '~/components/BatchBar'
import { TextWithAddresses } from '~/components/TextWithAddresses'
import { Notice } from '~/components/approval'
import { Box, Text } from '~/design-system'
import { useNetworkStatus } from '~/hooks/useNetworkStatus'
import { useSmartStatus } from '~/hooks/useSmartStatus'
import { aaConflictWarning } from '~/utils/accountMode'
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
  const { data: smart } = useSmartStatus()

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
      {/* Why the plate can't switch to smart or Kernel here. */}
      {smart?.ok === false && (
        <Box paddingHorizontal="12px">
          <Notice tone="yellow">
            <Text size="12px" wrap="anywhere">
              <TextWithAddresses text={aaConflictWarning(smart.conflicts)} />
            </Text>
          </Notice>
        </Box>
      )}
      {/* The batch bar's empty state; an open batch shows in the footer. */}
      <StartBatch account={account} />
      <TokensSection address={account.address} />
      <ConnectedSection />
      <RecentActivitySection address={account.address} />
    </div>
  )
}
