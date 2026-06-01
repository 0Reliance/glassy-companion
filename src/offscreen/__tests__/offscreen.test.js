import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mock all dependencies before importing the offscreen document ─────────────

vi.mock('../../lib/auth.js', () => ({
  getToken: vi.fn(async () => 'test-token'),
}))

vi.mock('../../lib/api.js', () => ({
  saveCapture: vi.fn(async () => ({ id: 'cap-1' })),
  saveBookmark: vi.fn(async () => ({ id: 'bm-1' })),
  saveDocument: vi.fn(async () => ({ id: 'doc-1' })),
  saveNote: vi.fn(async () => ({ id: 'note-1' })),
}))

vi.mock('../../lib/offlineQueue.js', () => ({
  enqueue: vi.fn(async () => ({ id: 'q-1' })),
}))

vi.mock('../../lib/capturePipeline.js', () => ({
  buildCaptureItem: vi.fn(async ({ item }) => ({ ...item, contentType: 'bookmark' })),
}))

vi.mock('../../background/savePolicy.js', () => ({
  // Default: a failed online save should be queued for retry.
  planBackgroundSaveFailure: vi.fn(() => ({ queue: true, kind: 'network' })),
  planQueueFailure: vi.fn(() => ({ action: 'drop', kind: 'fatal' })),
}))

const handlers = { onMessage: [] }

globalThis.chrome = {
  runtime: {
    id: 'test-ext-id',
    onMessage: { addListener: vi.fn(fn => handlers.onMessage.push(fn)) },
  },
}
vi.stubGlobal('navigator', { onLine: true })

await import('../offscreen.js')

const { saveCapture, saveDocument } = await import('../../lib/api.js')
const { enqueue } = await import('../../lib/offlineQueue.js')
const { planBackgroundSaveFailure, planQueueFailure } = await import('../../background/savePolicy.js')

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('navigator', { onLine: true })
})

function sendMessage(message) {
  return new Promise((resolve) => {
    for (const fn of handlers.onMessage) {
      fn(message, {}, resolve)
    }
  })
}

describe('offscreen.js', () => {
  describe('OFFSCREEN_PROCESS_CAPTURE', () => {
    it('saves a capture online and returns the result', async () => {
      saveCapture.mockResolvedValueOnce({ id: 'cap-9' })
      const res = await sendMessage({
        type: 'OFFSCREEN_PROCESS_CAPTURE',
        payload: { tabId: 1, tabUrl: 'https://example.com', item: { title: 'X' } },
      })
      expect(res).toMatchObject({ ok: true, data: { id: 'cap-9' } })
    })

    it('queues the capture (no ReferenceError) when an online save fails', async () => {
      // Regression: processCapture used planBackgroundSaveFailure without
      // importing it, so this branch threw "planBackgroundSaveFailure is not
      // defined" instead of queueing the failed save.
      saveCapture.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 503 }))
      const res = await sendMessage({
        type: 'OFFSCREEN_PROCESS_CAPTURE',
        payload: { tabId: 1, tabUrl: 'https://example.com', item: { title: 'X' } },
      })
      expect(planBackgroundSaveFailure).toHaveBeenCalled()
      expect(enqueue).toHaveBeenCalledWith('capture', expect.any(Object))
      expect(res).toMatchObject({ ok: true, queued: true })
    })
  })

  describe('OFFSCREEN_FLUSH_QUEUE_ITEM', () => {
    // The offscreen flusher is PURE w.r.t. the queue: it saves and reports the
    // outcome, but never mutates the queue itself (the service worker is the
    // single owner and batches all mutations via applyFlushOutcomes). The mock
    // only exports `enqueue` — if offscreen.js imported dequeue/incrementAttempts
    // the module would fail to load against this mock.
    it('reports synced without mutating the queue on success', async () => {
      saveDocument.mockResolvedValueOnce({ id: 'doc-2' })
      const res = await sendMessage({
        type: 'OFFSCREEN_FLUSH_QUEUE_ITEM',
        item: { id: 'q-7', type: 'page', payload: { url: 'https://e.com' }, attempts: 0 },
      })
      expect(res).toMatchObject({ ok: true, synced: true })
      expect(enqueue).not.toHaveBeenCalled()
    })

    it('reports retry when the save fails with a retryable error', async () => {
      planQueueFailure.mockReturnValueOnce({ action: 'retry', kind: 'network' })
      saveDocument.mockRejectedValueOnce(Object.assign(new Error('net'), { status: 503 }))
      const res = await sendMessage({
        type: 'OFFSCREEN_FLUSH_QUEUE_ITEM',
        item: { id: 'q-8', type: 'page', payload: { url: 'https://e.com' }, attempts: 1 },
      })
      expect(res).toMatchObject({ ok: false, retry: true })
    })

    it('reports dropped when the item has exhausted its attempts', async () => {
      const res = await sendMessage({
        type: 'OFFSCREEN_FLUSH_QUEUE_ITEM',
        item: { id: 'q-9', type: 'page', payload: { url: 'https://e.com' }, attempts: 5 },
      })
      expect(res).toMatchObject({ ok: true, dropped: true, reason: 'max_attempts' })
    })
  })

  describe('OFFSCREEN_PING', () => {
    it('responds ok', async () => {
      const res = await sendMessage({ type: 'OFFSCREEN_PING' })
      expect(res).toEqual({ ok: true })
    })
  })
})
