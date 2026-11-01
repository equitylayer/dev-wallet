import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { Text } from '~/design-system'
import { useScrollPositionStore } from '~/zustand'

import * as styles from './shell.css'

type Section = {
  label: string
  tab: string
  /** Detail routes that belong to this section. */
  routes: string[]
}

const sections: Section[] = [
  { label: 'Account', tab: 'account', routes: ['/account/', '/transfer/'] },
  { label: 'Contracts', tab: 'contracts', routes: ['/contract/'] },
  { label: 'Activity', tab: 'txs', routes: ['/transaction/'] },
  { label: 'Blocks', tab: 'blocks', routes: ['/block/'] },
]

export const defaultSection = sections[0].tab

function useActiveSection() {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  if (pathname === '/') {
    const tab = params.get('tab') || defaultSection
    // The full accounts list is reached from the strip and belongs to Account.
    return tab === 'accounts' ? 'account' : tab
  }
  return sections.find((section) =>
    section.routes.some((route) => pathname.startsWith(route)),
  )?.tab
}

export function BottomNav() {
  const navigate = useNavigate()
  const { setPosition } = useScrollPositionStore()
  const active = useActiveSection()

  return (
    <nav aria-label="Sections" className={styles.nav}>
      {sections.map((section) => (
        <button
          key={section.tab}
          type="button"
          aria-current={active === section.tab ? 'page' : undefined}
          className={styles.navItem}
          onClick={() => {
            setPosition(0)
            navigate(`/?tab=${section.tab}`)
          }}
        >
          <Text size="13px" wrap={false}>
            {section.label}
          </Text>
        </button>
      ))}
    </nav>
  )
}
