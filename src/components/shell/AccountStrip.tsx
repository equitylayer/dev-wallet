import { VenetianMask } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'

import { DevWalletIcon } from '~/components/svgs/DevWalletIcon'
import { Text } from '~/design-system'
import { useAccounts } from '~/hooks/useAccounts'
import { useSetAccount } from '~/hooks/useSetAccount'
import { truncate } from '~/utils'
import { useAccountStore } from '~/zustand'

import * as styles from './shell.css'

/** Keys 1–9 then 0 pick the first ten accounts, like browser tabs. */
const SHORTCUT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
}

/**
 * Global quick switch. Every account on this network is one tap (or one
 * digit key) away; the active one carries the accent rule. "All" opens the
 * full accounts list, where aliases, imports and impersonation live.
 */
export function AccountStrip() {
  const accounts = useAccounts()
  const { account: active } = useAccountStore()
  const { mutateAsync: setAccount } = useSetAccount()
  const location = useLocation()
  const [params] = useSearchParams()
  const activeRef = useRef<HTMLButtonElement>(null)
  const loaded = useMemo(
    () => accounts.filter((account) => account.state === 'loaded'),
    [accounts],
  )

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

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active?.key])

  const onAccountsList =
    location.pathname === '/' && params.get('tab') === 'accounts'

  return (
    <nav aria-label="Accounts" className={styles.strip}>
      <Link to="/" className={styles.stripHome} aria-label="Account home">
        <DevWalletIcon size="22px" />
      </Link>
      <div className={styles.chips}>
        {loaded.map((account, index) => {
          const isActive = account.address === active?.address
          const key = SHORTCUT_KEYS[index]
          return (
            <button
              key={account.key}
              ref={isActive ? activeRef : undefined}
              type="button"
              aria-current={isActive ? 'true' : undefined}
              aria-keyshortcuts={key}
              className={styles.chip}
              title={key ? `${account.address} (press ${key})` : account.address}
              onClick={() => {
                if (!isActive) void setAccount({ account, setActive: true })
              }}
            >
              {key && (
                <span className={styles.chipKey} aria-hidden>
                  {key}
                </span>
              )}
              {account.impersonate && (
                <VenetianMask
                  aria-label="Impersonated"
                  className={styles.chipIcon}
                  size={13}
                  strokeWidth={1.75}
                />
              )}
              {account.displayName ? (
                <Text size="12px" weight="medium" wrap={false}>
                  {account.displayName}
                </Text>
              ) : (
                <Text family="mono" size="12px" wrap={false}>
                  {truncate(account.address, { start: 6, end: 4 })}
                </Text>
              )}
            </button>
          )
        })}
      </div>
      <Link
        to="/?tab=accounts"
        aria-current={onAccountsList ? 'page' : undefined}
        className={styles.stripAll}
      >
        <Text size="12px" wrap={false}>
          All
        </Text>
        <Text color="text/tertiary" family="mono" size="12px" wrap={false}>
          {accounts.length}
        </Text>
      </Link>
    </nav>
  )
}
