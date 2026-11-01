import { describe, expect, test } from 'bun:test'

import { serialPerKey } from './serial'

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('serialPerKey', () => {
  test('runs the tasks of one key one at a time, in order', async () => {
    const run = serialPerKey()
    const log: string[] = []
    const first = deferred()
    const a = run('k', async () => {
      log.push('a start')
      await first.promise
      log.push('a end')
      return 'a'
    })
    const b = run('k', async () => {
      log.push('b start')
      return 'b'
    })
    await Bun.sleep(5)
    expect(log).toEqual(['a start'])
    first.resolve()
    expect(await Promise.all([a, b])).toEqual(['a', 'b'])
    expect(log).toEqual(['a start', 'a end', 'b start'])
  })

  test('a failed task does not stop the next, and keeps its own error', async () => {
    const run = serialPerKey()
    const a = run('k', async () => {
      throw new Error('boom')
    })
    const b = run('k', async () => 'b')
    await expect(a).rejects.toThrow('boom')
    expect(await b).toBe('b')
  })

  test('different keys do not wait for each other', async () => {
    const run = serialPerKey()
    const blocked = deferred()
    const a = run('one', () => blocked.promise)
    expect(await run('two', async () => 'two')).toBe('two')
    blocked.resolve()
    await a
  })

  test('separate instances keep separate queues', async () => {
    const outer = serialPerKey()
    const inner = serialPerKey()
    // A task may wait on another queue for the same key without deadlock.
    expect(await outer('k', () => inner('k', async () => 'ok'))).toBe('ok')
  })
})
