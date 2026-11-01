import { toast } from 'sonner'

import { getMessenger } from '~/messengers'
import type { Schema } from '~/messengers/schema'

const backgroundMessenger = getMessenger('background:wallet')

/**
 * Changes the open batch through the background, its only writer (sign,
 * discard, Start batch, remove, move). A refusal shows as a toast. Resolves
 * whether the change went through.
 */
export async function batchQueue(
  payload: Schema['batchQueue'][0],
): Promise<boolean> {
  try {
    const result = await backgroundMessenger.send('batchQueue', payload)
    if (result.ok) return true
    toast.error(result.error.message)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
  return false
}
