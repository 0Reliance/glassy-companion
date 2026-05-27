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
  checkUrl: vi.fn(async () => ({ exists: false })),
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

vi.mock('../../lib/premiumMarkdown.js', () => ({
  assemblePremiumMarkdown: vi.fn((item) => {
    let md = `# ${item.title}\n\n`
    md += `**Source:** [${item.siteName || item.domain || 'Source'}](${item.sourceUrl})\n`
    if (item.author) md += `**Author:** ${item.author}\n`
    md += `**Captured on:** ${new Date().toLocaleDateString()}\n\n`
    if (item.note) md += `### Personal Note\n\n${item.note}\n\n---\n\n`
    if (item.highlights?.length) {
      md += `### Highlights\n\n`
      item.highlights.forEach(h => { md += `> ${h.text}\n\n` })
      md += `---\n\n`
    }
    return md + (item.contentMarkdown || '')
  }),
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
    id: 'test-ext-id',
    onInstalled: { addListener: vi.fn(fn => handlers.onInstalled.push(fn)) },
    onStartup: { addListener: vi.fn(fn => handlers.onStartup.push(fn)) },
    onMessage: { addListener: vi.fn(fn => handlers.onMessage.push(fn)) },
    sendMessage: vi.fn(async (msg, callback) => {
      // Mock offscreen document responses — must call callback (Chrome MV3 pattern)
      if (msg?.type === 'OFFSCREEN_PROCESS_CAPTURE') {
        const { saveCapture } = await vi.importMock('../../lib/api.js')
        const item = { ...msg.payload?.item }
        if (!item.contentType) item.contentType = 'bookmark'
        const result = await saveCapture(item)
        if (callback) callback(result)
        return result
      }
      if (msg?.type === 'OFFSCREEN_FLUSH_QUEUE_ITEM') {
        const { saveDocument, saveBookmark, saveNote } = await vi.importMock('../../lib/api.js')
        const item = msg.item
        let result
        if (item.type === 'capture') result = await saveDocument(item.payload)
        else if (item.type === 'bookmark') result = await saveBookmark(item.payload)
        else if (item.type === 'page' || item.type === 'document') result = await saveDocument(item.payload)
        else result = await saveNote(item.payload)
        if (callback) callback({ ok: true, synced: true, data: result })
        return { ok: true, synced: true, data: result }
      }
      if (callback) callback({ ok: true })
      return { ok: true }
    }),
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
        const kArr = Array.isArray(keys) ? keys : Object.keys(keys)
        for (const k of kArr) r[k] = sessionStore[k]
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
    sendMessage: vi.fn(async () => ({ ok: true })),
    get: vi.fn(async () => ({ id: 1, url: 'https://example.com', title: 'Test Tab', favIconUrl: '' })),
    onActivated: { addListener: vi.fn(fn => handlers.onActivated.push(fn)) },
    onUpdated: { addListener: vi.fn(fn => handlers.onUpdated.push(fn)) },
  },
  notifications: {
    create: vi.fn(),
  },
  offscreen: {
    createDocument: vi.fn(async () => {}),
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
        payload: { sourceUrl: 'https://example.com', title: 'Test', siteName: 'Example' },
      })
      expect(result.ok).toBe(true)
      expect(saveCapture).toHaveBeenCalled()
      const call = saveCapture.mock.calls[0][0]
      expect(call.title).toBe('Test')
      expect(call.contentMarkdown).toContain('# Test')
    })

    it('assemblePremiumMarkdown includes author, source link, and personal note', async () => {
      await sendMessage({
        type: 'SAVE_CAPTURE',
        payload: {
          sourceUrl: 'https://blog.example/post-1',
          title: 'My Article',
          siteName: 'Example Blog',
          author: 'Jane Doe',
          note: 'Worth revisiting',
        },
      })
      const { contentMarkdown } = saveCapture.mock.calls[0][0]
      expect(contentMarkdown).toContain('# My Article')
      expect(contentMarkdown).toContain('**Author:** Jane Doe')
      expect(contentMarkdown).toContain('**Source:**')
      expect(contentMarkdown).toContain('### Personal Note')
      expect(contentMarkdown).toContain('Worth revisiting')
    })

    it('returns duplicate flag and skips badge update when server returns 409 duplicate', async () => {
      saveCapture.mockResolvedValueOnce({ duplicate: true, id: 'existing-cap-1' })

      const result = await sendMessage({
        type: 'SAVE_CAPTURE',
        payload: { sourceUrl: 'https://example.com', title: 'Already saved' },
      })
      expect(result.ok).toBe(true)
      expect(result.data.duplicate).toBe(true)
      expect(result.data.id).toBe('existing-cap-1')
      expect(chromeMock.action.setBadgeText).not.toHaveBeenCalled()
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

describe('service-worker.js — context menu captures', () => {
  it('saves a link without extracting metadata from the surrounding page', async () => {
    const clickHandler = handlers.onClicked[0]

    await clickHandler(
      { menuItemId: 'glassy_save_link', linkUrl: 'https://target.example/post', linkText: 'Target post' },
      { id: 1, url: 'https://source.example/page', title: 'Source Page' }
    )

    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled()
    expect(saveCapture).toHaveBeenCalled()
    const payload = saveCapture.mock.calls[0][0]
    expect(payload.sourceUrl).toBe('https://target.example/post')
    expect(payload.title).toBe('Target post')
    expect(payload.contentType).toBe('bookmark')
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

  it('replays queued page saves through saveDocument', async () => {
    getQueue.mockResolvedValueOnce([
      { id: 'queued-page-1', type: 'page', payload: { url: 'https://example.com/page', title: 'Queued page' }, attempts: 0 },
    ])

    const alarmHandler = handlers.onAlarm[0]
    await alarmHandler({ name: 'glassy_offline_sync' })

    expect(saveDocument).toHaveBeenCalledWith({ url: 'https://example.com/page', title: 'Queued page' })
  })
})
