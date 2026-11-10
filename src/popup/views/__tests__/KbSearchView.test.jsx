// @vitest-environment jsdom
/**
 * KbSearchView on Glassy 2.63+ (the one search).
 *
 * What these guard, each found against the v2.65.16 server:
 *   - the tabs send the server's own source names (routes/kb.js SOURCE_TYPE_MAP). The
 *     Vault tab used to send 'vault_files', which the server drops, so it got everything;
 *   - a result opens the item itself on the person's Glassy, in a new tab. A relative
 *     '#/notes' link used to stay inside the popup;
 *   - "search is off" is decided by status, not by the message's words, which the server
 *     rewrote in v2.63–v2.65.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

const searchKnowledgeBase = vi.fn()
const getKbStatus = vi.fn()

vi.mock('../../../lib/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, searchKnowledgeBase: (...a) => searchKnowledgeBase(...a), getKbStatus: (...a) => getKbStatus(...a) }
})
vi.mock('../../../lib/auth.js', () => ({ getBaseUrl: vi.fn(async () => 'https://glassy.test') }))

const { default: KbSearchView, routeFor, SOURCE_TYPES } = await import('../KbSearchView.jsx')
const { ApiError } = await import('../../../lib/api.js')

// The server's source names at v2.65.16 (server/routes/kb.js SOURCE_TYPE_MAP), minus
// 'help', which the extension doesn't offer.
const SERVER_SOURCES = ['bookmarks', 'notes', 'documents', 'voice', 'vault']

describe('the tabs speak the server’s source names', () => {
  it('every tab other than All is a source the server knows', () => {
    const ids = SOURCE_TYPES.map(s => s.id).filter(id => id !== 'all')
    for (const id of ids) expect(SERVER_SOURCES).toContain(id)
    expect(ids.sort()).toEqual([...SERVER_SOURCES].sort())
  })
})

describe('a result opens the item in Glassy', () => {
  it('links notes and documents to the item itself', () => {
    expect(routeFor({ sourceType: 'note', sourceId: 'n 1' })).toBe('#/notes/n%201')
    expect(routeFor({ sourceType: 'document', sourceId: 'd1' })).toBe('#/docs/d1')
  })
  it('opens Keep searched for a bookmark, and the vault file by path', () => {
    expect(routeFor({ sourceType: 'bookmark', sourceId: '7', title: 'Boiler guide' })).toBe('#/keep?q=Boiler%20guide')
    expect(routeFor({ sourceType: 'vault_file', sourceId: 'Home/a.md' })).toBe('#/vault?file=Home%2Fa.md')
  })
  it('sends voice to the recordings', () => {
    expect(routeFor({ sourceType: 'voice_transcript', sourceId: 'v1' })).toBe('#/voice')
  })
})

describe('the view', () => {
  let container, root
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    globalThis.chrome = { tabs: { create: vi.fn() } }
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    getKbStatus.mockResolvedValue({ corpus: { totalChunks: 12 } })
  })

  async function search(words, { tab } = {}) {
    await act(async () => { root.render(createElement(KbSearchView)) })
    if (tab) {
      const btn = [...container.querySelectorAll('button')].find(b => b.textContent.includes(tab))
      expect(btn, `tab ${tab} did not render`).toBeTruthy()
      await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    }
    const input = container.querySelector('input')
    expect(input, 'search box did not render').toBeTruthy()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    await act(async () => {
      setter.call(input, words)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { await new Promise(r => setTimeout(r, 450)) })
  }

  it('the Vault tab asks the server for the vault, by its name', async () => {
    searchKnowledgeBase.mockResolvedValue({ results: [] })
    await search('boiler', { tab: 'Vault' })
    expect(searchKnowledgeBase).toHaveBeenCalledWith('boiler', expect.objectContaining({ sources: ['vault'] }))
  })

  it('clicking a result opens the item on the person’s Glassy in a new tab', async () => {
    searchKnowledgeBase.mockResolvedValue({ results: [{ sourceType: 'note', sourceId: 'abc', title: 'Boiler notes', excerpt: 'pressure', score: 0.8 }] })
    await search('boiler')
    const link = [...container.querySelectorAll('a')].find(a => a.textContent.includes('Boiler notes'))
    expect(link, 'result did not render').toBeTruthy()
    await act(async () => { link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    await act(async () => { await Promise.resolve() })
    expect(globalThis.chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://glassy.test/#/notes/abc' })
  })

  it('a 403 means search is off on this Glassy, whatever its words', async () => {
    searchKnowledgeBase.mockRejectedValue(new ApiError(403, 'Library search is switched off here', null))
    await search('boiler')
    expect(container.textContent).toContain('Library search is off on this Glassy')
  })

  it('another error shows the server’s own message', async () => {
    searchKnowledgeBase.mockRejectedValue(new ApiError(400, 'Type at least 2 characters to search.', null))
    await search('b')
    expect(container.textContent).toContain('Type at least 2 characters to search.')
    expect(container.textContent).not.toContain('Library search is off')
  })

  it('with no meaning vectors yet, it says the search is by words, not that it’s still indexing', async () => {
    getKbStatus.mockResolvedValue({ corpus: { totalChunks: 0 } })
    await act(async () => { root.render(createElement(KbSearchView)) })
    await act(async () => { await Promise.resolve() })
    expect(container.textContent).toContain('Searching by words for now')
    expect(container.textContent).not.toMatch(/still indexing/i)
  })
})
