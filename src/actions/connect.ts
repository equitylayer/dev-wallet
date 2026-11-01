import { numberToHex } from 'viem'

import { connectEvent } from '~/messengers/page-events'
import { sendPageEvent } from '~/messengers/sendPageEvent'
import { networkStore, sessionsStore } from '~/zustand'

/** Connects the site, and tells its pages (and no other site's). */
export async function connect({ host }: { host: string }) {
  const { network } = networkStore.getState()

  const { addSession } = sessionsStore.getState()
  addSession({ session: { host } })

  await sendPageEvent(connectEvent(host, numberToHex(network.chainId)))
}
