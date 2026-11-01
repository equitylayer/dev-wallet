import { Send as SendIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatEther, parseEther } from 'viem'

import { ImportAccount } from '~/components/ImportAccount'
import { Box, Button, Input, Text } from '~/design-system'
import { useBalance } from '~/hooks/useBalance'
import { useBytecode } from '~/hooks/useBytecode'
import { useNonce } from '~/hooks/useNonce'
import { useSetBalance } from '~/hooks/useSetBalance'
import { useSetNonce } from '~/hooks/useSetNonce'
import { formatEth } from '~/utils'
import { useAccountStore } from '~/zustand'
import type { Account } from '~/zustand/account'

import * as styles from './account-home.css'

const ALIAS_MAX_LENGTH = 24

// Sections imports it from here.
export { formatEth }

type Mode = 'view' | 'edit' | 'impersonate'

export function AccountPlate({
  account,
  online,
}: { account: Account; online: boolean }) {
  const [mode, setMode] = useState<Mode>('view')
  const navigate = useNavigate()

  // A different account is a fresh plate: drop any half-finished edit.
  useEffect(() => setMode('view'), [account.address])

  return (
    <section
      key={account.address}
      aria-label="Active account"
      className={styles.plate}
    >
      <Identity account={account} />
      <Box className={styles.address}>
        <Text color="text/secondary" family="mono" size="12px" wrap="anywhere">
          {account.address}
        </Text>
        <Button.Copy height="20px" text={account.address} variant="ghost primary" />
      </Box>

      {/* Smart-account slot: the mode, delegation and payer line goes here
          once engineering stores it. Until then it renders nothing. */}

      {mode === 'edit' ? (
        <EditState
          account={account}
          disabled={!online}
          onDone={() => setMode('view')}
        />
      ) : (
        <>
          <Readouts account={account} />
          {mode === 'impersonate' ? (
            <Box className={styles.actions}>
              <Box className={styles.grow}>
                <ImportAccount
                  autoFocus
                  setActive
                  submitLabel="Impersonate"
                  onDone={() => setMode('view')}
                />
              </Box>
              <Button
                height="24px"
                variant="ghost primary"
                width="fit"
                onClick={() => setMode('view')}
              >
                Cancel
              </Button>
            </Box>
          ) : (
            <Box className={styles.actions}>
              <Box className={styles.grow}>
                <Button.Root
                  disabled={!online}
                  height="28px"
                  variant="solid invert"
                  width="full"
                  type="button"
                  onClick={() => navigate(`/transfer/${account.address}`)}
                >
                  <Box className={styles.buttonContent}>
                    <SendIcon size={14} strokeWidth={1.75} />
                    <Text size="13px" weight="medium" wrap={false}>
                      Send
                    </Text>
                  </Box>
                </Button.Root>
              </Box>
              <Box className={styles.grow}>
                <Button
                  disabled={!online}
                  height="28px"
                  variant="stroked fill"
                  width="full"
                  onClick={() => setMode('edit')}
                >
                  Edit state
                </Button>
              </Box>
              <Box className={styles.grow}>
                <Button
                  disabled={!online}
                  height="28px"
                  variant="stroked fill"
                  width="full"
                  onClick={() => setMode('impersonate')}
                >
                  Impersonate
                </Button>
              </Box>
            </Box>
          )}
        </>
      )}
    </section>
  )
}

////////////////////////////////////////////////////////////////////////
// Identity: alias (or short address), tags, rename

function Identity({ account }: { account: Account }) {
  const { upsertAccount } = useAccountStore()
  const [renaming, setRenaming] = useState(false)
  const [alias, setAlias] = useState(account.displayName ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setRenaming(false)
    setAlias(account.displayName ?? '')
  }, [account.address, account.displayName])

  useEffect(() => {
    if (renaming) inputRef.current?.focus()
  }, [renaming])

  const save = () => {
    const trimmed = alias.trim()
    upsertAccount({
      account: { ...account, displayName: trimmed || undefined },
    })
    setRenaming(false)
  }
  const cancel = () => {
    setAlias(account.displayName ?? '')
    setRenaming(false)
  }

  return (
    <Box className={styles.identity}>
      {renaming ? (
        <Box className={styles.grow} style={{ maxWidth: '240px' }}>
          <Input
            ref={inputRef}
            aria-label="Account alias"
            height="24px"
            maxLength={ALIAS_MAX_LENGTH}
            placeholder="Alias, e.g. deployer"
            value={alias}
            onBlur={save}
            onChange={(e) => setAlias(e.target.value.slice(0, ALIAS_MAX_LENGTH))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') cancel()
            }}
          />
        </Box>
      ) : account.displayName ? (
        <Box className={styles.shrink}>
          <Text as="h1" size="20px" weight="medium" wrap={false}>
            {account.displayName}
          </Text>
        </Box>
      ) : (
        // No alias: the full address below is the identity, so the title
        // slot invites naming instead of repeating the address.
        <button
          type="button"
          className={styles.addAlias}
          onClick={() => setRenaming(true)}
        >
          <Text size="20px" weight="medium" wrap={false}>
            Add alias
          </Text>
        </button>
      )}
      {account.impersonate && !renaming && (
        <Box className={styles.tag}>
          <Text size="11px" weight="medium" wrap={false}>
            Impersonated
          </Text>
        </Box>
      )}
      {!renaming && account.displayName && (
        <Box className={styles.identityTools}>
          <Button.Symbol
            label="Rename"
            symbol="square.and.pencil"
            height="24px"
            variant="ghost primary"
            onClick={() => setRenaming(true)}
          />
        </Box>
      )}
    </Box>
  )
}

////////////////////////////////////////////////////////////////////////
// Readouts: balance, nonce, code

function Readout({
  label,
  children,
  title,
}: { label: string; children: React.ReactNode; title?: string }) {
  return (
    <Box className={styles.readout} title={title}>
      <Text color="text/tertiary" size="11px" wrap={false}>
        {label}
      </Text>
      <Box className={styles.readoutValue}>{children}</Box>
    </Box>
  )
}

function Readouts({ account }: { account: Account }) {
  const { data: balance } = useBalance({ address: account.address })
  const { data: nonce } = useNonce({ address: account.address })
  const { data: code, isSuccess: codeLoaded } = useBytecode({
    address: account.address,
  })

  const code_ = (() => {
    if (!codeLoaded) return { label: '—' }
    if (!code || code === '0x') return { label: 'None' }
    // EIP-7702 delegation designator: 0xef0100 ++ delegate address.
    if (code.startsWith('0xef0100'))
      return {
        label: '7702',
        title: `Delegates to 0x${code.slice(8)}`,
      }
    return { label: 'Contract', title: `${(code.length - 2) / 2} bytes` }
  })()

  return (
    <Box className={styles.readouts}>
      <Readout
        label="Balance"
        title={balance != null ? `${formatEther(balance)} ETH` : undefined}
      >
        <Text family="mono" size="14px" tabular wrap={false}>
          {balance != null ? formatEth(balance) : '—'}
        </Text>
        <Text color="text/tertiary" size="11px" wrap={false}>
          ETH
        </Text>
      </Readout>
      <Readout label="Nonce">
        <Text family="mono" size="14px" tabular wrap={false}>
          {nonce !== undefined ? nonce.toString() : '—'}
        </Text>
      </Readout>
      <Readout label="Code" title={code_.title}>
        <Text size="14px" wrap={false}>
          {code_.label}
        </Text>
      </Readout>
    </Box>
  )
}

////////////////////////////////////////////////////////////////////////
// Edit state: balance and nonce in place

function EditState({
  account,
  disabled,
  onDone,
}: { account: Account; disabled: boolean; onDone: () => void }) {
  const { data: balance } = useBalance({ address: account.address })
  const { data: nonce } = useNonce({ address: account.address })
  const { mutateAsync: setBalance } = useSetBalance()
  const { mutateAsync: setNonce } = useSetNonce()

  const [balanceValue, setBalanceValue] = useState(
    balance != null ? formatEther(balance) : '',
  )
  const [nonceValue, setNonceValue] = useState(nonce?.toString() ?? '')
  const [error, setError] = useState<string>()
  const balanceRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    balanceRef.current?.focus()
    balanceRef.current?.select()
  }, [])

  const apply = async () => {
    setError(undefined)
    let nextBalance: bigint
    try {
      nextBalance = parseEther(balanceValue.trim() as `${number}`)
    } catch {
      setError('Balance must be a number of ETH, like 100 or 0.5.')
      return
    }
    const nextNonce = Number(nonceValue)
    if (!Number.isInteger(nextNonce) || nextNonce < 0) {
      setError('Nonce must be a whole number, 0 or more.')
      return
    }
    try {
      if (nextBalance !== balance)
        await setBalance({ address: account.address, value: nextBalance })
      if (nextNonce !== nonce)
        await setNonce({ address: account.address, nonce: nextNonce })
      onDone()
    } catch (e) {
      setError(
        `The node rejected the change: ${(e as Error).message.split('\n')[0]}`,
      )
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void apply()
    if (e.key === 'Escape') onDone()
  }

  return (
    <>
      <Box className={styles.readouts}>
        <Readout label="Balance (ETH)">
          <Box className={styles.grow}>
            <Input
              ref={balanceRef}
              aria-label="Balance in ETH"
              height="24px"
              inputMode="decimal"
              value={balanceValue}
              onChange={(e) => setBalanceValue(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </Box>
        </Readout>
        <Readout label="Nonce">
          <Box className={styles.grow}>
            <Input
              aria-label="Nonce"
              height="24px"
              inputMode="numeric"
              value={nonceValue}
              onChange={(e) => setNonceValue(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </Box>
        </Readout>
      </Box>
      {error && (
        <Box paddingTop="12px">
          <Text color="surface/red" size="12px">
            {error}
          </Text>
        </Box>
      )}
      <Box className={styles.actions}>
        <Button
          disabled={disabled}
          height="28px"
          variant="solid invert"
          width="fit"
          onClick={() => void apply()}
        >
          Apply
        </Button>
        <Button height="28px" variant="stroked fill" width="fit" onClick={onDone}>
          Cancel
        </Button>
        <Box className={styles.grow}>
          <Text color="text/tertiary" size="12px" wrap={false}>
            Enter applies, Esc cancels
          </Text>
        </Box>
      </Box>
    </>
  )
}
