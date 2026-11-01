import { useSyncExternalStoreWithTracked } from '~/hooks/useSyncExternalStoreWithTracked'

import {
  type Session,
  findSession,
  withSession,
  withoutSession,
} from './sessions-logic'
import { createStore } from './utils'

type Host = string

export type SessionsState = {
  sessions: Session[]
}
export type SessionsActions = {
  addSession: ({ session }: { session: Session }) => void
  getSession: ({ host }: { host: Host }) => Session | undefined
  removeSession: ({ host }: { host: Host }) => void
}
export type SessionsStore = SessionsState & SessionsActions

// Hosts are stored and matched normalized, and no host is no site
// (`sessions-logic`).
export const sessionsStore = createStore<SessionsStore>(
  (set, get) => ({
    sessions: [],
    addSession({ session }) {
      const sessions = withSession(get().sessions, session)
      if (sessions === get().sessions) return
      set((state) => ({ ...state, sessions }))
    },
    getSession({ host }) {
      return findSession(get().sessions, host)
    },
    removeSession({ host }) {
      set((state) => ({
        ...state,
        sessions: withoutSession(state.sessions, host),
      }))
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
