import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('useExtensionBridge', () => {
  let sendMessageSpy

  beforeEach(async () => {
    sendMessageSpy = vi.fn()
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: sendMessageSpy,
        lastError: null,
      },
    })
    vi.resetModules()
  })

  async function importBridge() {
    return import('../../popup/hooks/useExtensionBridge.js')
  }

  it('checkAuth sends CHECK_AUTH message', async () => {
    sendMessageSpy.mockImplementation((msg, cb) => cb({ authenticated: true, user: { id: 1 } }))
    const { checkAuth } = await importBridge()
    const result = await checkAuth()
    expect(sendMessageSpy).toHaveBeenCalledWith({ type: 'CHECK_AUTH' }, expect.any(Function))
    expect(result).toEqual({ authenticated: true, user: { id: 1 } })
  })

  it('saveBookmark sends SAVE_BOOKMARK with payload', async () => {
    sendMessageSpy.mockImplementation((msg, cb) => cb({ ok: true }))
    const { saveBookmark } = await importBridge()
    const payload = { url: 'https://example.com', title: 'Test' }
    const result = await saveBookmark(payload)
    expect(sendMessageSpy).toHaveBeenCalledWith({ type: 'SAVE_BOOKMARK', payload }, expect.any(Function))
    expect(result).toEqual({ ok: true })
  })

  it('saveNote sends SAVE_NOTE with payload', async () => {
    sendMessageSpy.mockImplementation((msg, cb) => cb({ ok: true }))
    const { saveNote } = await importBridge()
    const payload = { content: 'hello', title: 'Note', content_format: 'markdown' }
    await saveNote(payload)
    expect(sendMessageSpy).toHaveBeenCalledWith(
      { type: 'SAVE_NOTE', payload },
      expect.any(Function),
    )
  })

  it('searchBookmarks sends SEARCH_BOOKMARKS with query', async () => {
    sendMessageSpy.mockImplementation((msg, cb) => cb({ ok: true, bookmarks: [] }))
    const { searchBookmarks } = await importBridge()
    await searchBookmarks('react')
    expect(sendMessageSpy).toHaveBeenCalledWith({ type: 'SEARCH_BOOKMARKS', query: 'react' }, expect.any(Function))
  })

  it('getQueueLength sends GET_QUEUE_LENGTH', async () => {
    sendMessageSpy.mockImplementation((msg, cb) => cb({ ok: true, count: 5 }))
    const { getQueueLength } = await importBridge()
    const result = await getQueueLength()
    expect(result).toEqual({ ok: true, count: 5 })
  })

  it('logout sends LOGOUT message', async () => {
    sendMessageSpy.mockImplementation((msg, cb) => cb({ ok: true }))
    const { logout } = await importBridge()
    await logout()
    expect(sendMessageSpy).toHaveBeenCalledWith({ type: 'LOGOUT' }, expect.any(Function))
  })

  it('rejects when chrome.runtime.lastError is set', async () => {
    sendMessageSpy.mockImplementation((msg, cb) => {
      chrome.runtime.lastError = { message: 'Extension context invalidated' }
      cb(undefined)
      chrome.runtime.lastError = null
    })

    const { checkAuth } = await importBridge()
    await expect(checkAuth()).rejects.toMatchObject({
      message: 'Extension context invalidated',
    })
  })

  it('saveAllTabs sends SAVE_ALL_TABS', async () => {
    sendMessageSpy.mockImplementation((msg, cb) => cb({ ok: true, saved: 5, skipped: 2, total: 7 }))
    const { saveAllTabs } = await importBridge()
    const result = await saveAllTabs()
    expect(result).toEqual({ ok: true, saved: 5, skipped: 2, total: 7 })
  })

  it('getActiveTabMeta sends GET_ACTIVE_TAB_META', async () => {
    const meta = { url: 'https://test.com', title: 'Test', domain: 'test.com' }
    sendMessageSpy.mockImplementation((msg, cb) => cb({ ok: true, meta }))
    const { getActiveTabMeta } = await importBridge()
    const result = await getActiveTabMeta()
    expect(result).toEqual({ ok: true, meta })
  })
})
