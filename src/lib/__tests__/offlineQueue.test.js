import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearQueue,
  dequeue,
  enqueue,
  getQueue,
  incrementAttempts,
} from '../offlineQueue.js'

function createStorageArea() {
  const store = new Map()

  return {
    async get(key) {
      if (Array.isArray(key)) {
        return Object.fromEntries(key.map(entry => [entry, store.get(entry)]))
      }
      return { [key]: store.get(key) }
    },
    async set(values) {
      for (const [key, value] of Object.entries(values)) {
        store.set(key, value)
      }
    },
    async remove(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
}

describe('offlineQueue', () => {
  const local = createStorageArea()

  beforeEach(async () => {
    local.clear()
    vi.stubGlobal('chrome', {
      storage: { local },
    })
    await clearQueue()
  })

  it('enqueues and reads items back', async () => {
    const item = await enqueue('bookmark', { url: 'https://example.com' })
    const queue = await getQueue()

    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({
      id: item.id,
      type: 'bookmark',
      payload: { url: 'https://example.com' },
      attempts: 0,
    })
  })

  it('increments attempts without changing other fields', async () => {
    const item = await enqueue('note', { content: 'hello' })
    await incrementAttempts(item.id)

    const [queuedItem] = await getQueue()
    expect(queuedItem.attempts).toBe(1)
    expect(queuedItem.payload).toEqual({ content: 'hello' })
  })

  it('dequeues specific items only', async () => {
    const first = await enqueue('bookmark', { url: 'https://one.test' })
    await enqueue('bookmark', { url: 'https://two.test' })

    await dequeue(first.id)

    const queue = await getQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].payload.url).toBe('https://two.test')
  })

  it('clears the entire queue', async () => {
    await enqueue('bookmark', { url: 'https://example.com' })
    await clearQueue()

    await expect(getQueue()).resolves.toEqual([])
  })
})