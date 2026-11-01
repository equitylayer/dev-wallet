import { Check, ChevronDown, CircleDashed } from 'lucide-react'
import { useId, useState } from 'react'

import { ConfirmActions } from '~/components/Confirm'
import { TextWithAddresses } from '~/components/TextWithAddresses'
import { Box, Button, Text } from '~/design-system'
import {
  type AccountModeAction,
  modeLabel,
  useAccountMode,
} from '~/hooks/useAccountMode'
import { useEntryPointNonce } from '~/hooks/useEntryPointNonce'
import { useSmartStatus } from '~/hooks/useSmartStatus'
import { KERNEL_V3_3 } from '~/smart/constants'
import { truncate } from '~/utils'
import {
  aaConflictWarning,
  actionLabels,
  clearsDelegation,
  primaryModeAction,
} from '~/utils/accountMode'
import type { Account } from '~/zustand/account'

import * as styles from './account-home.css'

const PLAIN_MODES = [
  {
    mode: 'plain-upgradable',
    description:
      "Sends as an EOA. A dApp's wallet_sendCalls upgrades it to Kernel first.",
  },
  {
    mode: 'plain-never',
    description: 'Always sends as an EOA, and is never upgraded.',
  },
] as const

const progress: Record<AccountModeAction, string> = {
  smart: 'Switching to smart…',
  'switch-to-kernel': 'Switching to Kernel…',
  revoke: 'Revoking the delegation…',
  'plain-upgradable': 'Switching to Plain (upgradable)…',
  'plain-never': 'Switching to Plain…',
}

/**
 * The plate's smart-account slot: what the account is (its mode against its
 * code), where it delegates and its EntryPoint nonce, and the mode changes.
 * Changes go to the background; one that clears a delegation asks first.
 */
export function SmartAccount({
  account,
  online,
}: { account: Account; online: boolean }) {
  const { mode, onchain, set } = useAccountMode(account.address)
  const { data: status } = useSmartStatus()
  const isKernel = onchain?.kind === 'kernel'
  const { data: entryPointNonce } = useEntryPointNonce({
    address: account.address,
    enabled: isKernel,
  })
  const [busy, setBusy] = useState<AccountModeAction | null>(null)
  const [error, setError] = useState<string>()
  const [confirming, setConfirming] = useState<AccountModeAction | null>(null)
  const [advanced, setAdvanced] = useState(false)
  const advancedId = useId()

  if (!mode || !onchain)
    return (
      <Box className={styles.smart} aria-busy>
        <Text color="text/tertiary" size="13px">
          —
        </Text>
      </Box>
    )

  const label = modeLabel(mode, onchain)
  const primary = primaryModeAction(mode, onchain)
  // DevWallet never touches contract code.
  const changeable = onchain.kind !== 'contract'
  const blocked = !online || busy !== null || confirming !== null
  // Without the AA contracts nothing can be delegated to Kernel.
  const aaOff = status?.ok === false ? aaConflictWarning(status.conflicts) : null

  async function run(action: AccountModeAction) {
    setConfirming(null)
    setError(undefined)
    setBusy(action)
    try {
      await set(action)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  function request(action: AccountModeAction) {
    if (onchain && clearsDelegation(action, onchain)) {
      setError(undefined)
      setConfirming(action)
    } else void run(action)
  }

  const confirm = confirming && (
    <Box className={styles.smartConfirm}>
      <Text color="text/secondary" size="12px">
        {confirming === 'revoke'
          ? "Clears the account's code on the node. It becomes Plain (upgradable)."
          : "Clears the account's Kernel delegation on the node."}
      </Text>
      <Box paddingTop="8px">
        <ConfirmActions
          confirm={
            confirming === 'revoke'
              ? actionLabels.revoke
              : `Switch to ${actionLabels[confirming]}`
          }
          disabled={!online}
          height="24px"
          onConfirm={() => void run(confirming)}
          onCancel={() => setConfirming(null)}
        />
      </Box>
    </Box>
  )

  return (
    <Box className={styles.smart} aria-busy={busy !== null}>
      <Box
        className={styles.smartLine}
        title={onchain.kind === 'delegated' ? label : undefined}
      >
        <Box className={styles.shrink}>
          <Text size="13px">
            <TextWithAddresses short text={label} />
          </Text>
        </Box>
        {onchain.kind === 'delegated' && (
          <Button.Copy
            height="20px"
            text={onchain.target}
            variant="ghost primary"
          />
        )}
      </Box>

      {isKernel && (
        <Box className={styles.smartDetails}>
          {/* Unwrapped text: a single-line Text fills a flex row. */}
          <Box className={styles.pair}>
            <Text color="text/tertiary" size="12px">
              Delegates to
            </Text>
            <Box title={KERNEL_V3_3}>
              <Text color="text/secondary" family="mono" size="12px">
                {truncate(KERNEL_V3_3, { start: 6, end: 4 })}
              </Text>
            </Box>
            <Button.Copy
              height="20px"
              text={KERNEL_V3_3}
              variant="ghost primary"
            />
          </Box>
          <Box className={styles.pair}>
            <Text color="text/tertiary" size="12px">
              EntryPoint nonce
            </Text>
            <Text family="mono" size="12px" tabular>
              {entryPointNonce !== undefined ? entryPointNonce.toString() : '—'}
            </Text>
          </Box>
        </Box>
      )}

      {changeable &&
        (confirming === 'revoke' ? (
          confirm
        ) : (
          <Box className={styles.smartActions}>
            {primary && (
              // A disabled button can't show its own reason.
              <Box
                title={
                  aaOff && primary !== 'revoke' ? aaOff : undefined
                }
              >
                <Button
                  disabled={blocked || (primary !== 'revoke' && aaOff !== null)}
                  height="24px"
                  variant={primary === 'revoke' ? 'ghost red' : 'stroked fill'}
                  width="fit"
                  onClick={() => request(primary)}
                >
                  {actionLabels[primary]}
                </Button>
              </Box>
            )}
            <button
              type="button"
              aria-controls={advancedId}
              aria-expanded={advanced}
              className={styles.disclosure}
              onClick={() => setAdvanced(!advanced)}
            >
              <Text size="12px">Advanced</Text>
              <ChevronDown
                className={styles.disclosureIcon}
                size={14}
                strokeWidth={1.75}
              />
            </button>
          </Box>
        ))}

      {changeable && advanced && (
        <Box id={advancedId} className={styles.advanced}>
          {PLAIN_MODES.map((option) => {
            const current = mode === option.mode
            return (
              <button
                key={option.mode}
                type="button"
                aria-pressed={current}
                className={styles.option}
                disabled={blocked || current}
                onClick={() => request(option.mode)}
              >
                <Box className={styles.optionCheck}>
                  {current && <Check size={14} strokeWidth={1.75} />}
                </Box>
                <Box className={styles.grow}>
                  <Text size="13px">{actionLabels[option.mode]}</Text>
                  <Box paddingTop="6px">
                    <Text color="text/tertiary" size="12px">
                      {option.description}
                    </Text>
                  </Box>
                </Box>
              </button>
            )
          })}
          {confirming && confirming !== 'revoke' && (
            <Box className={styles.advancedConfirm}>{confirm}</Box>
          )}
        </Box>
      )}

      {busy && (
        <div role="status" className={styles.smartNote}>
          <CircleDashed size={14} strokeWidth={1.75} />
          <Text color="text/tertiary" size="12px">
            {progress[busy]}
          </Text>
        </div>
      )}
      {error && (
        <Box paddingTop="8px" role="alert">
          <Text color="surface/red" size="12px">
            {error}
          </Text>
        </Box>
      )}
    </Box>
  )
}
