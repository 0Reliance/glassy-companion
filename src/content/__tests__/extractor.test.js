// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── JSDOM environment globals needed by extractor.js ──────────────────────────
// Provide NodeFilter (not in vitest jsdom by default via globalThis)
// vitest uses jsdom environment — these should be available, but ensure they are:

function setupChromeMock() {
  const listeners = []
  globalThis.chrome = {
    runtime: {
      onMessage: {
        addListener: vi.fn((fn) => listeners.push(fn)),
      },
    },
  }
  return listeners
}

// Helper to fire a message and capture the response
function sendMessage(listeners, message) {
  return new Promise((resolve) => {
    for (const fn of listeners) {
      fn(message, {}, resolve)
    }
  })
}

describe('extractor.js', () => {
  let messageListeners

  beforeEach(async () => {
    messageListeners = setupChromeMock()

    // Set up a minimal document body
    document.body.innerHTML = `
      <article>
        <h1>Hello World</h1>
        <p>Some article content here.</p>
      </article>
      <script>var x = 1</script>
      <style>.a { color: red }</style>
      <nav>Nav link</nav>
    `

    // Reset location stub (jsdom provides window.location)
    Object.defineProperty(window, 'location', {
      value: { href: 'https://example.com/article', origin: 'https://example.com' },
      writable: true,
      configurable: true,
    })

    // Import (or re-execute) extractor to register the listener
    // Use dynamic import with a cache-bust to re-register on each test run
    vi.resetModules()
    await import('../../content/extractor.js')
    // After reset, the new listeners array is populated
    // Note: messageListeners captured the old reference — get updated list from chrome mock
    messageListeners = globalThis.chrome.runtime.onMessage.addListener.mock.calls.map(c => c[0])
  })

  describe('GET_PAGE_META', () => {
    it('returns page metadata including title and url', async () => {
      document.title = 'Test Page'
      const response = await sendMessage(messageListeners, { type: 'GET_PAGE_META' })
      expect(response).toMatchObject({
        meta: expect.objectContaining({
          url: 'https://example.com/article',
          title: expect.any(String),
        }),
        selectedText: expect.any(String),
      })
    })
  })

  describe('GET_SELECTION_HTML', () => {
    it('returns empty string when nothing selected', async () => {
      window.getSelection = vi.fn(() => ({ rangeCount: 0 }))
      const response = await sendMessage(messageListeners, { type: 'GET_SELECTION_HTML' })
      expect(response).toEqual({ html: '' })
    })

    it('returns html from selection ranges', async () => {
      const fakeRange = {
        cloneContents: () => {
          const div = document.createElement('div')
          div.innerHTML = '<strong>bold text</strong>'
          const frag = document.createDocumentFragment()
          frag.appendChild(div)
          return frag
        },
      }
      window.getSelection = vi.fn(() => ({
        rangeCount: 1,
        getRangeAt: vi.fn(() => fakeRange),
      }))

      const response = await sendMessage(messageListeners, { type: 'GET_SELECTION_HTML' })
      expect(response.html).toContain('strong')
      expect(response.html).toContain('bold text')
    })
  })

  describe('GET_SELECTED_TEXT', () => {
    it('returns selected text string', async () => {
      window.getSelection = vi.fn(() => ({
        toString: () => '  hello world  ',
      }))
      const response = await sendMessage(messageListeners, { type: 'GET_SELECTED_TEXT' })
      expect(response).toEqual({ text: 'hello world' })
    })

    it('returns empty string when selection is null', async () => {
      window.getSelection = vi.fn(() => null)
      const response = await sendMessage(messageListeners, { type: 'GET_SELECTED_TEXT' })
      expect(response).toEqual({ text: '' })
    })
  })

  describe('GET_PAGE_TEXT', () => {
    it('returns text content from article', async () => {
      const response = await sendMessage(messageListeners, { type: 'GET_PAGE_TEXT' })
      expect(response.text).toContain('Hello World')
      expect(response.text).toContain('Some article content here.')
    })

    it('does not include script tag content', async () => {
      const response = await sendMessage(messageListeners, { type: 'GET_PAGE_TEXT' })
      expect(response.text).not.toContain('var x = 1')
    })

    it('does not include nav content', async () => {
      const response = await sendMessage(messageListeners, { type: 'GET_PAGE_TEXT' })
      expect(response.text).not.toContain('Nav link')
    })
  })

  describe('GET_PAGE_HTML', () => {
    it('returns url, title and excerpt', async () => {
      document.title = 'My Page'
      const response = await sendMessage(messageListeners, { type: 'GET_PAGE_HTML' })
      expect(response).toMatchObject({
        url: 'https://example.com/article',
        title: 'My Page',
        excerpt: expect.any(String),
      })
    })

    it('excerpt is at most 500 chars', async () => {
      document.body.innerHTML = '<p>' + 'a'.repeat(600) + '</p>'
      const response = await sendMessage(messageListeners, { type: 'GET_PAGE_HTML' })
      expect(response.excerpt.length).toBeLessThanOrEqual(500)
    })
  })

  describe('unknown message type', () => {
    it('returns false for unknown message types', () => {
      for (const fn of messageListeners) {
        const result = fn({ type: 'UNKNOWN' }, {}, vi.fn())
        expect(result).toBe(false)
      }
    })
  })
})
