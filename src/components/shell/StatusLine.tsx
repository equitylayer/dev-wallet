import { History, Pickaxe, Settings2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Tooltip } from '~/components/Tooltip'
import { Box } from '~/design-system'
import { useGetAutomine } from '~/hooks/useGetAutomine'
import { useMine } from '~/hooks/useMine'
import { useNetworkStatus } from '~/hooks/useNetworkStatus'
import { usePendingBlock } from '~/hooks/usePendingBlock'
import { useRevert } from '~/hooks/useRevert'
import { useSnapshot } from '~/hooks/useSnapshot'
import { useNetworkStore } from '~/zustand'

import * as styles from './shell.css'

const blockNumberIntl = new Intl.NumberFormat('en-US')

/**
 * The node's state in one line: reachability, RPC, chain, block, mining
 * mode, and the two chain controls used most (revert, mine).
 */
export function StatusLine({ offline }: { offline: boolean }) {
  const { network } = useNetworkStore()
  const { status } = useNetworkStatus()
  const { data: block } = usePendingBlock()
  const { data: automining } = useGetAutomine()

  const dotColor =
    status === 'pending'
      ? 'surface/invert@0.5'
      : offline
        ? 'surface/red'
        : 'surface/green'

  const miningMode = automining
    ? 'Auto'
    : network.blockTime
      ? `Every ${network.blockTime}s`
      : 'Manual'

  return (
    <div className={styles.status}>
      <Link
        to="/networks"
        className={styles.statusLink}
        title={offline ? 'Node unreachable. Open networks' : 'Networks'}
        style={{ flexShrink: 1 }}
      >
        <Box aria-hidden backgroundColor={dotColor} className={styles.dot} />
        <span
          className={styles.statusText}
          data-tone={offline ? 'red' : 'secondary'}
          data-host
        >
          {network.rpcUrl.replace(/https?:\/\//, '')}
        </span>
        <span className={styles.statusSep} aria-hidden />
        <span className={styles.statusText} data-tone="secondary" data-fixed>
          {network.chainId}
        </span>
      </Link>
      <span className={styles.statusSep} aria-hidden />
      <Link
        to="/block-config"
        className={styles.statusLink}
        title={block ? `Mining: ${miningMode}. Open block config` : 'Block config'}
        aria-disabled={offline}
        style={{ flexShrink: 0 }}
      >
        {offline ? (
          <span className={styles.statusLabel} data-tone="red">
            Offline
          </span>
        ) : (
          <>
            <span className={styles.statusText} data-fixed>
              {block?.number
                ? `#${blockNumberIntl.format(block.number)}`
                : '—'}
            </span>
            <span className={styles.miningMode} data-tone="secondary">
              {block ? miningMode : ''}
            </span>
          </>
        )}
      </Link>
      <div className={styles.statusTools}>
        <RevertButton
          blockNumber={block?.number ?? undefined}
          disabled={offline}
        />
        <MineButton
          blockNumber={block?.number ?? undefined}
          disabled={offline || !block}
        />
        <Tooltip label="Settings">
          <Link to="/settings" className={styles.toolButton} aria-label="Settings">
            <Settings2 size={15} strokeWidth={1.75} />
          </Link>
        </Tooltip>
      </div>
    </div>
  )
}

function MineButton({
  blockNumber,
  disabled,
}: { blockNumber?: bigint; disabled: boolean }) {
  const { mutateAsync: mine } = useMine()
  return (
    <Tooltip label="Mine one block">
      <button
        type="button"
        aria-label="Mine one block"
        className={styles.mineButton}
        disabled={disabled}
        onClick={() => mine({ blocks: 1 })}
      >
        {/* Remount per block so the swing plays once for each new block. */}
        <Pickaxe
          key={blockNumber?.toString()}
          className={styles.mineIcon}
          size={14}
          strokeWidth={1.75}
        />
      </button>
    </Tooltip>
  )
}

function RevertButton({
  blockNumber,
  disabled,
}: { blockNumber?: bigint; disabled: boolean }) {
  const { data: snapshot } = useSnapshot({
    blockNumber: blockNumber ? blockNumber - 1n : undefined,
    enabled: false,
  })
  const { mutateAsync: revert } = useRevert()
  return (
    <Tooltip label={snapshot ? 'Revert the last block' : 'No snapshot to revert to'}>
      <button
        type="button"
        aria-label="Revert the last block"
        className={styles.toolButton}
        disabled={disabled || !snapshot}
        onClick={() => snapshot && revert({ id: snapshot })}
      >
        <History size={15} strokeWidth={1.75} />
      </button>
    </Tooltip>
  )
}
