/**
 * A queue per key: each task starts once every earlier task for the same key
 * has settled, whether it resolved or threw. Keys don't wait for each other.
 *
 * A task must not wait on a later task of its own queue (that deadlocks), but
 * may use another instance's queue for the same key.
 */
export function serialPerKey() {
  const tails = new Map<string, Promise<unknown>>()
  return function run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const result = (tails.get(key) ?? Promise.resolve()).then(task)
    const tail = result.catch(() => {})
    tails.set(key, tail)
    // Forget the key once its queue drains.
    tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key)
    })
    return result
  }
}
