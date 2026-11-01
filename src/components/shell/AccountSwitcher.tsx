import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronDown, VenetianMask } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { DevWalletIcon } from '~/components/svgs/DevWalletIcon'
import { Input } from '~/design-system'
import { useAccounts } from '~/hooks/useAccounts'
import { useBalance } from '~/hooks/useBalance'
import { isImportable, useImportAccount } from '~/hooks/useImportAccount'
import { useSetAccount } from '~/hooks/useSetAccount'
import { formatEth, truncate } from '~/utils'
import { useAccountStore } from '~/zustand'
import type { Account } from '~/zustand/account'

import * as styles from './shell.css'

/** Keys 1–9 then 0 pick the first ten accounts, like browser tabs. */
const SHORTCUT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
}

/**
 * Global quick switch. The bar names the active account on every screen;
 * opening it lists every account on this network with its balance, filters
 * as you type, and impersonates a pasted address or ENS name. Digit keys
 * switch without opening it.
 */
export function AccountSwitcher() {
  const accounts = useAccounts()
  const { account: active } = useAccountStore()
  const { mutateAsync: setAccount } = useSetAccount()
  const [open, setOpen] = useState(false)
  const loaded = useMemo(
    () => accounts.filter((account) => account.state === 'loaded'),
    [accounts],
  )

  const select = (account: Account) => {
    if (account.address !== active?.address)
      void setAccount({ account, setActive: true })
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if (isTyping(e.target)) return
      const account = loaded[SHORTCUT_KEYS.indexOf(e.key)]
      if (!account) return
      e.preventDefault()
      if (account.address !== active?.address)
        void setAccount({ account, setActive: true })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [loaded, active?.address, setAccount])

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <nav aria-label="Account" className={styles.bar}>
          <Link to="/" className={styles.barHome} aria-label="Account home">
            <DevWalletIcon size="22px" />
          </Link>
          <Popover.Trigger asChild>
            <button
              type="button"
              className={styles.switcher}
              aria-label={
                active
                  ? `Switch account. Active: ${active.displayName ?? active.address}`
                  : 'Switch account'
              }
              title="Switch account (keys 1–9 and 0)"
            >
              {active ? (
                <AccountLabel account={active} />
              ) : (
                <span className={styles.switcherEmpty}>No account</span>
              )}
              <ChevronDown
                aria-hidden
                className={styles.switcherChevron}
                size={14}
                strokeWidth={1.75}
              />
            </button>
          </Popover.Trigger>
        </nav>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="start"
          alignOffset={8}
          aria-label="Switch account"
          className={styles.pop}
          side="bottom"
          sideOffset={4}
        >
          <AccountList
            accounts={loaded}
            activeAddress={active?.address}
            onClose={() => setOpen(false)}
            onSelect={(account) => {
              setOpen(false)
              select(account)
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function AccountLabel({
  account,
  muted,
}: { account: Account; muted?: boolean }) {
  const short = truncate(account.address, { start: 6, end: 4 })
  return (
    <>
      {account.impersonate && (
        <VenetianMask
          aria-label="Impersonated"
          className={styles.accountIcon}
          size={13}
          strokeWidth={1.75}
        />
      )}
      {account.displayName ? (
        <>
          <span className={styles.accountName}>{account.displayName}</span>
          <span className={styles.accountAddress}>{short}</span>
        </>
      ) : (
        <span
          className={styles.accountAddress}
          data-alone
          data-muted={muted || undefined}
        >
          {short}
        </span>
      )}
    </>
  )
}

////////////////////////////////////////////////////////////////////////
// The list: a combobox over the accounts, plus an impersonate row

type Option =
  | { kind: 'account'; account: Account }
  | { kind: 'import'; value: string }

function AccountList({
  accounts,
  activeAddress,
  onClose,
  onSelect,
}: {
  accounts: Account[]
  activeAddress?: string
  onClose: () => void
  onSelect: (account: Account) => void
}) {
  const importAccount = useImportAccount()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(() =>
    Math.max(
      0,
      accounts.findIndex((account) => account.address === activeAddress),
    ),
  )

  const value = query.trim()
  const needle = value.toLowerCase()
  const matches = needle
    ? accounts.filter(
        (account) =>
          account.address.toLowerCase().includes(needle) ||
          account.displayName?.toLowerCase().includes(needle),
      )
    : accounts
  const known = accounts.some(
    (account) =>
      account.address.toLowerCase() === needle ||
      account.displayName?.toLowerCase() === needle,
  )
  const canImport = Boolean(value) && !known && isImportable(value)

  const options: Option[] = [
    ...(canImport ? [{ kind: 'import', value } as const] : []),
    ...matches.map((account) => ({ kind: 'account', account }) as const),
  ]
  const current = Math.min(highlight, options.length - 1)
  const optionId = (index: number) => `${listId}-${index}`

  useEffect(() => {
    if (current < 0) return
    document
      .getElementById(optionId(current))
      ?.scrollIntoView({ block: 'nearest' })
  })

  const choose = (option?: Option) => {
    if (!option) return
    if (option.kind === 'account') return onSelect(option.account)
    onClose()
    void importAccount(option.value, { setActive: true })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!options.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setHighlight((current + step + options.length) % options.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(options[current])
    }
  }

  return (
    <>
      <div className={styles.popFilter}>
        <Input
          aria-activedescendant={current >= 0 ? optionId(current) : undefined}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded
          aria-label="Filter accounts, or paste an address or ENS name to impersonate"
          autoComplete="off"
          height="28px"
          placeholder="Filter, or paste an address to impersonate"
          role="combobox"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setHighlight(0)
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <div
        aria-label="Accounts"
        className={styles.list}
        id={listId}
        role="listbox"
      >
        {options.map((option, index) =>
          option.kind === 'import' ? (
            <div
              key="import"
              aria-selected={index === current}
              className={styles.option}
              data-highlighted={index === current || undefined}
              id={optionId(index)}
              role="option"
              onClick={() => choose(option)}
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => setHighlight(index)}
            >
              <VenetianMask
                aria-hidden
                className={styles.accountIcon}
                size={13}
                strokeWidth={1.75}
              />
              <span className={styles.accountName}>Impersonate</span>
              <span className={styles.accountAddress}>
                {option.value.startsWith('0x')
                  ? truncate(option.value, { start: 6, end: 4 })
                  : option.value}
              </span>
            </div>
          ) : (
            <AccountOption
              key={option.account.key}
              account={option.account}
              highlighted={index === current}
              id={optionId(index)}
              isActive={option.account.address === activeAddress}
              shortcut={SHORTCUT_KEYS[accounts.indexOf(option.account)]}
              onChoose={() => choose(option)}
              onHover={() => setHighlight(index)}
            />
          ),
        )}
      </div>
      {canImport && (
        <p className={styles.popNote}>
          Not one of your accounts. Enter adds it and switches to it on this
          node.
        </p>
      )}
      {options.length === 0 && (
        <p className={styles.popEmpty}>
          No account matches. Paste a full address or ENS name to impersonate
          it.
        </p>
      )}
      <div className={styles.popFoot}>
        <Link
          to="/?tab=accounts"
          className={styles.popFootLink}
          onClick={onClose}
        >
          All accounts
        </Link>
        <span className={styles.popHint}>Arrow keys move, Enter switches</span>
      </div>
    </>
  )
}

function AccountOption({
  account,
  highlighted,
  id,
  isActive,
  shortcut,
  onChoose,
  onHover,
}: {
  account: Account
  highlighted: boolean
  id: string
  isActive: boolean
  shortcut?: string
  onChoose: () => void
  onHover: () => void
}) {
  const { data: balance } = useBalance({ address: account.address })
  return (
    <div
      aria-selected={highlighted}
      className={styles.option}
      data-active={isActive || undefined}
      data-highlighted={highlighted || undefined}
      id={id}
      role="option"
      title={account.address}
      onClick={onChoose}
      onMouseDown={(e) => e.preventDefault()}
      onMouseMove={onHover}
    >
      <span className={styles.optionKey} aria-hidden>
        {shortcut ?? ''}
      </span>
      <AccountLabel account={account} muted />
      <span className={styles.optionBalance}>
        {balance != null ? formatEth(balance) : '—'}
      </span>
      {isActive ? (
        <Check aria-label="Active" className={styles.optionCheck} strokeWidth={2} />
      ) : (
        <span aria-hidden className={styles.optionCheck} />
      )}
    </div>
  )
}
