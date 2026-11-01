import { useSyncExternalStoreWithTracked } from '~/hooks/useSyncExternalStoreWithTracked'
import { normalizeHost } from '~/utils/host'

import { createStore } from './utils'

type Host = string
type Session = { host: Host; autoApprove?: boolean }

export type SessionsState = {
  sessions: Session[]
}
export type SessionsActions = {
  addSession: ({ session }: { session: Session }) => void
  getSession: ({ host }: { host: Host }) => Session | undefined
  removeSession: ({ host }: { host: Host }) => void
}
export type SessionsStore = SessionsState & SessionsActions

/** Hosts are stored and matched normalized (`normalizeHost`). */
const sameHost = (a: Host, b: Host) => normalizeHost(a) === normalizeHost(b)

export const sessionsStore = createStore<SessionsStore>(
  (set, get) => ({
    sessions: [],
    addSession({ session }) {
      if (get().sessions.find((s) => sameHost(s.host, session.host))) return
      set((state) => ({
        ...state,
        sessions: [
          ...state.sessions,
          { ...session, host: normalizeHost(session.host) },
        ],
      }))
    },
    getSession({ host }) {
      return get().sessions.find((session) => sameHost(session.host, host))
    },
    removeSession({ host }) {
      set((state) => {
        const sessions = state.sessions.filter(
          (session) => !sameHost(session.host, host),
        )
        return {
          ...state,
          sessions,
        }
      })
    },
  }),
  {
    persist: {
      name: 'sessions',
      version: 0,
    },
  },
)

export const useSessionsStore = () =>
  useSyncExternalStoreWithTracked(
    sessionsStore.subscribe,
    sessionsStore.getState,
  )
