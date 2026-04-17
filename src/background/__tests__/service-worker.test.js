import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mock all dependencies before importing the service worker ─────────────────

vi.mock('../../lib/auth.js', () => ({
  getToken: vi.fn(async () => 'test-token'),
  verifyToken: vi.fn(async () => ({ ok: true, user: { id: 'u1' } })),
  clearAuth: vi.fn(async () => {}),
}))

vi.mock('../../lib/api.js', () => ({
  saveBookmark: vi.fn(async () => ({ id: 'bm-1' })),
  saveNote: vi.fn(async () => ({ id: 'note-1' })),
  saveDocument: vi.fn(async () => ({ id: 'doc-1' })),
  searchBookmarks: vi.fn(async () => ({ bookmarks: [] })),
  checkUrl: vi.fn(async () => ({ saved: false })),
}))

vi.mock('../../lib/offlineQueue.js', () => ({
  enqueue: vi.fn(async () => {}),
  getQueue: vi.fn(async () => []),
  dequeue: vi.fn(async () => {}),
  incrementAttempts: vi.fn(async () => {}),
  clearQueue: vi.fn(async () => {}),
}))

vi.mock('../../lib/cache.js', () => ({
  // badgeCount: true so updateBadge() doesn't short-circuit
  getSettings: vi.fn(async () => ({
    aiAutoTag: true,
    showNotifications: true,
    badgeCount: true,
  })),
}))

vi.mock('../savePolicy.js', () => ({
  planBackgroundSaveFailure: vi.fn(() => ({ kind: 'error', queue: false })),
  planQueueFailure: vi.fn(() => ({ action: 'drop', kind: 'fatal' })),
}))

// ── Build ONE stable chrome mock used throughout all tests ────────────────────
// service-worker.js registers its listeners at import time.
// Using vi.resetModules() in beforeEach causes mock module references to diverge.
// Instead we import once, keep the same chromeMock, and use vi.clearAllMocks()
// to reset call counts between tests.

const sessionStore = {}

const handlers = {
  onInstalled: [],
  onStartup: [],
  onMessage: [],
  onAlarm: [],
  onClicked: [],
  onCommand: [],
  onActivated: [],
  onUpdated: [],
}

const chromeMock = {
  _handlers: handlers,
  runtime: {
    onInstalled: { addListener: vi.fn(fn => handlers.onInstalled.push(fn)) },
    onStartup: { addListener: vi.fn(fn => handlers.onStartup.push(fn)) },
    onMessage: { addListener: vi.fn(fn => handlers.onMessage.push(fn)) },
  },
  alarms: {
    get: vi.fn(async () => null),
    create: vi.fn(async () => {}),
    onAlarm: { addListener: vi.fn(fn => handlers.onAlarm.push(fn)) },
  },
  contextMenus: {
    removeAll: vi.fn(cb => cb && cb()),
    create: vi.fn(),
    onClicked: { addListener: vi.fn(fn => handlers.onClicked.push(fn)) },
  },
  commands: {
    onCommand: { addListener: vi.fn(fn => handlers.onCommand.push(fn)) },
  },
  storage: {
    session: {
      get: vi.fn(async (keys) => {
        if (typeof keys === 'string') return { [keys]: sessionStore[keys] }
        const r = {}
        for (const k of (Array.isArray(keys) ? keys : Object.keys(keys))) r[k] = sessionStore[k]
        return r
      }),
      set: vi.fn(async (obj) => Object.assign(sessionStore, obj)),
      remove: vi.fn(async (key) => {
        if (Array.isArray(key)) key.forEach(k => delete sessionStore[k])
        else delete sessionStore[key]
      }),
    },
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    },
  },
  action: {
    setBadgeText: vi.fn(async () => {}),
    setBadgeBackgroundColor: vi.fn(async () => {}),
    openPopup: vi.fn(async () => {}),
  },
  tabs: {
    query: vi.fn(async () => [{ id: 1, url: 'https://example.com', title: 'Test Tab', favIconUrl: '' }]),
    sendMessage: vi.fn(async () => ({ meta: { url: 'https://example.com', title: 'Test Tab' } })),
    get: vi.fn(async () => ({ id: 1, url: 'https://example.com', title: 'Test Tab', favIconUrl: '' })),
    onActivated: { addListener: vi.fn(fn => handlers.onActivated.push(fn)) },
    onUpdated: { addListener: vi.fn(fn => handlers.onUpdated.push(fn)) },
  },
  notifications: {
    create: vi.fn(),
  },
}

// Set globals before the service worker is imported
globalThis.chrome = chromeMock
globalThis.navigator = { onLine: true }

// Import service worker ONCE — registers all listeners on chromeMock above
await import('../service-worker.js')

// Get stable references to mocked module exports
const { saveDocument, saveBookmark, saveNote, searchBookmarks } = await import('../../lib/api.js')
const { clearAuth } = await import('../../lib/auth.js')
const { getQueue } = await import('../../lib/offlineQueue.js')

// ── beforeEach: reset call counts and mutable state ──────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.navigator = { onLine: true }
  Object.keys(sessionStore).forEach(k => delete sessionStore[k])
})

// ── Helper: dispatch a message and capture the response ───────────────────────

function sendMessage(message) {
  return new Promise((resolve) => {
    for (const fn of handlers.onMessage) {
      fn(message, {}, resolve)
    }
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('service-worker.js — message handler', () => {
  describe('SAVE_PAGE', () => {
    it('calls saveDocument with payload and returns ok', async () => {
      const result = await sendMessage({
        type: 'SAVE_PAGE',
        payload: { url: 'https://example.com', title: 'Test' },
      })
      expect(result.ok).toBe(true)
      expect(result.data).toMatchObject({ id: 'doc-1' })
      expect(saveDocument).toHaveBeenCalledWith({ url: 'https://example.com', title: 'Test' })
    })

    it('returns error when saveDocument throws', async () => {
      saveDocument.mockRejectedValueOnce({ message: 'API Error', status: 500 })

      const result = await sendMessage({
        type: 'SAVE_PAGE',
        payload: { url: 'https://example.com', title: 'Test' },
      })
      expect(result.ok).toBe(false)
      expect(result.error).toBe('API Error')
      expect(result.status).toBe(500)
    })

    it('updates badge on successful page save', async () => {
      await sendMessage({
        type: 'SAVE_PAGE',
        payload: { url: 'https://example.com', title: 'Test' },
      })
      expect(chromeMock.action.setBadgeText).toHaveBeenCalled()
    })
  })

  describe('SAVE_BOOKMARK', () => {
    it('calls saveBookmark with payload', async () => {
      const result = await sendMessage({
        type: 'SAVE_BOOKMARK',
        payload: { url: 'https://example.com', title: 'Test' },
      })
      expect(result.ok).toBe(true)
      expect(saveBookmark).toHaveBeenCalledWith({ url: 'https://example.com', title: 'Test' })
    })

    it('returns error on api failure', async () => {
      saveBookmark.mockRejectedValueOnce({ message: 'Failed', status: 400 })

      const result = await sendMessage({
        type: 'SAVE_BOOKMARK',
        payload: { url: 'https://example.com' },
      })
      expect(result.ok).toBe(false)
      expect(result.error).toBe('Failed')
    })
  })

  describe('SAVE_NOTE', () => {
    it('calls saveNote with payload', async () => {
      const result = await sendMessage({
        type: 'SAVE_NOTE',
        payload: { content: 'My note', title: 'Note title' },
      })
      expect(result.ok).toBe(true)
      expect(saveNote).toHaveBeenCalledWith({ content: 'My note', title: 'Note title' })
    })
  })

  describe('CHECK_AUTH', () => {
    // service-worker checkAuth() returns { authenticated, user } shape (not { ok })
    it('returns authenticated:true when token is verified', async () => {
      const result = await sendMessage({ type: 'CHECK_AUTH' })
      expect(result.authenticated).toBe(true)
      expect(result.user).toMatchObject({ id: 'u1' })
    })
  })

  describe('LOGOUT', () => {
    it('clears auth and resets badge', async () => {
      const result = await sendMessage({ type: 'LOGOUT' })
      expect(result.ok).toBe(true)
      expect(clearAuth).toHaveBeenCalled()
      expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ text: '' })
    })
  })

  describe('GET_QUEUE_LENGTH', () => {
    it('returns item count from queue', async () => {
      getQueue.mockResolvedValueOnce([{ id: 1 }, { id: 2 }])

      const result = await sendMessage({ type: 'GET_QUEUE_LENGTH' })
      expect(result.ok).toBe(true)
      expect(result.count).toBe(2)
    })

    it('returns 0 for empty queue', async () => {
      const result = await sendMessage({ type: 'GET_QUEUE_LENGTH' })
      expect(result.ok).toBe(true)
      expect(result.count).toBe(0)
    })
  })

  describe('SEARCH_BOOKMARKS', () => {
    it('returns bookmarks from search', async () => {
      searchBookmarks.mockResolvedValueOnce({ bookmarks: [{ id: 'bm-1' }] })

      const result = await sendMessage({ type: 'SEARCH_BOOKMARKS', query: 'glassy' })
      expect(result.ok).toBe(true)
      expect(result.bookmarks).toHaveLength(1)
      expect(searchBookmarks).toHaveBeenCalledWith('glassy')
    })

    it('returns empty array when no results', async () => {
      const result = await sendMessage({ type: 'SEARCH_BOOKMARKS', query: 'nothing' })
      expect(result.ok).toBe(true)
      expect(result.bookmarks).toEqual([])
    })
  })

  describe('unknown message type', () => {
    it('returns ok:false for unknown message types', async () => {
      const result = await sendMessage({ type: 'TOTALLY_UNKNOWN_TYPE' })
      expect(result.ok).toBe(false)
      expect(result.error).toBe('Unknown message type')
    })
  })
})

describe('service-worker.js — offline queue flush', () => {
  it('registers an alarm listener on startup', () => {
    expect(handlers.onAlarm.length).toBeGreaterThan(0)
  })

  it('skips flush when navigator is offline', async () => {
    globalThis.navigator = { onLine: false }

    const alarmHandler = handlers.onAlarm[0]
    await alarmHandler({ name: 'glassy_offline_sync' })

    expect(getQueue).not.toHaveBeenCalled()
  })

  it('ignores alarms with a different name', async () => {
    const alarmHandler = handlers.onAlarm[0]
    await alarmHandler({ name: 'some_other_alarm' })

    expect(getQueue).not.toHaveBeenCalled()
  })

  it('processes empty queue without sending notifications', async () => {
    const alarmHandler = handlers.onAlarm[0]
    await alarmHandler({ name: 'glassy_offline_sync' })

    expect(getQueue).toHaveBeenCalled()
    expect(chromeMock.notifications.create).not.toHaveBeenCalled()
  })
})
