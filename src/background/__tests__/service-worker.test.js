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
  saveCapture: vi.fn(async () => ({ id: 'cap-1' })),
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

globalThis.chrome = chromeMock
vi.stubGlobal('navigator', { onLine: true })

await import('../service-worker.js')

const { saveDocument, saveBookmark, saveNote, searchBookmarks, saveCapture } = await import('../../lib/api.js')
const { clearAuth } = await import('../../lib/auth.js')
const { getQueue } = await import('../../lib/offlineQueue.js')

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('navigator', { onLine: true })
  Object.keys(sessionStore).forEach(k => delete sessionStore[k])
})

function sendMessage(message) {
  return new Promise((resolve) => {
    for (const fn of handlers.onMessage) {
      fn(message, {}, resolve)
    }
  })
}

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

  describe('SAVE_CAPTURE', () => {
    it('calls saveCapture with payload', async () => {
      const result = await sendMessage({
        type: 'SAVE_CAPTURE',
        payload: { sourceUrl: 'https://example.com', title: 'Test' },
      })
      expect(result.ok).toBe(true)
      expect(saveCapture).toHaveBeenCalledWith({ sourceUrl: 'https://example.com', title: 'Test' })
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

  describe('SEARCH_BOOKMARKS', () => {
    it('returns bookmarks from search', async () => {
      searchBookmarks.mockResolvedValueOnce({ bookmarks: [{ id: 'bm-1' }] })

      const result = await sendMessage({ type: 'SEARCH_BOOKMARKS', query: 'glassy' })
      expect(result.ok).toBe(true)
      expect(result.bookmarks).toHaveLength(1)
      expect(searchBookmarks).toHaveBeenCalledWith('glassy')
    })
  })

  describe('GET_QUEUE_LENGTH', () => {
    it('returns item count from queue', async () => {
      getQueue.mockResolvedValueOnce([{ id: 1 }, { id: 2 }])

      const result = await sendMessage({ type: 'GET_QUEUE_LENGTH' })
      expect(result.ok).toBe(true)
      expect(result.count).toBe(2)
    })
  })
})

describe('service-worker.js — offline queue flush', () => {
  it('registers an alarm listener on startup', () => {
    expect(handlers.onAlarm.length).toBeGreaterThan(0)
  })

  it('skips flush when navigator is offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })

    const alarmHandler = handlers.onAlarm[0]
    await alarmHandler({ name: 'glassy_offline_sync' })

    expect(getQueue).not.toHaveBeenCalled()
  })

  it('processes empty queue without sending notifications', async () => {
    const alarmHandler = handlers.onAlarm[0]
    await alarmHandler({ name: 'glassy_offline_sync' })

    expect(getQueue).toHaveBeenCalled()
    expect(chromeMock.notifications.create).not.toHaveBeenCalled()
  })
})
