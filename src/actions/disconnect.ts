import { disconnectEvent } from '~/messengers/page-events'
import { sendPageEvent } from '~/messengers/sendPageEvent'
import { sessionsStore } from '~/zustand'

/** Disconnects the site, and tells its pages (and no other site's). */
export async function disconnect({ host }: { host: string }) {
  const { removeSession } = sessionsStore.getState()
  removeSession({ host })

  await sendPageEvent(disconnectEvent(host))
}
