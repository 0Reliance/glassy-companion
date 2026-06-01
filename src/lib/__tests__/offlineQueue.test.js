import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyFlushOutcomes,
  clearQueue,
  dequeue,
  enqueue,
  getQueue,
  incrementAttempts,
  MAX_QUEUE_SIZE,
  QueueFullError,
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

  it('throws QueueFullError when queue reaches MAX_QUEUE_SIZE', async () => {
    // Pre-seed storage with MAX_QUEUE_SIZE items to avoid 200 awaited enqueues
    const seeded = Array.from({ length: MAX_QUEUE_SIZE }, (_, i) => ({
      id: `seed-${i}`,
      type: 'bookmark',
      payload: { url: `https://seed-${i}.test` },
      queuedAt: i,
      attempts: 0,
    }))
    await local.set({ glassy_offline_queue: seeded })

    await expect(enqueue('bookmark', { url: 'https://overflow.test' }))
      .rejects.toBeInstanceOf(QueueFullError)

    const queue = await getQueue()
    expect(queue).toHaveLength(MAX_QUEUE_SIZE)
    expect(queue.find(it => it.payload.url === 'https://overflow.test')).toBeUndefined()
  })

  describe('applyFlushOutcomes', () => {
    it('removes and increments in a single batch', async () => {
      const a = await enqueue('bookmark', { url: 'https://a.test' })
      const b = await enqueue('bookmark', { url: 'https://b.test' })
      const c = await enqueue('bookmark', { url: 'https://c.test' })

      await applyFlushOutcomes({ remove: [a.id, c.id], increment: [b.id] })

      const queue = await getQueue()
      expect(queue).toHaveLength(1)
      expect(queue[0].id).toBe(b.id)
      expect(queue[0].attempts).toBe(1)
    })

    it('lets removal win when an id is in both sets', async () => {
      const a = await enqueue('note', { content: 'x' })
      await applyFlushOutcomes({ remove: [a.id], increment: [a.id] })
      await expect(getQueue()).resolves.toEqual([])
    })

    it('preserves items enqueued during the flush window', async () => {
      const a = await enqueue('bookmark', { url: 'https://a.test' })
      // Simulate a concurrent enqueue that happened after the flush snapshot.
      const concurrent = await enqueue('bookmark', { url: 'https://late.test' })

      await applyFlushOutcomes({ remove: [a.id] })

      const queue = await getQueue()
      expect(queue).toHaveLength(1)
      expect(queue[0].id).toBe(concurrent.id)
    })

    it('is a no-op when given empty sets', async () => {
      await enqueue('bookmark', { url: 'https://keep.test' })
      await applyFlushOutcomes({ remove: [], increment: [] })
      await expect(getQueue()).resolves.toHaveLength(1)
    })
  })
})