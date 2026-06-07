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

  describe('GET_STRUCTURED_CONTENT', () => {
    it('extracts article content from a semantic <article> element', async () => {
      document.body.innerHTML = `
        <nav>Menu links go here</nav>
        <article>
          <h1>Real Article</h1>
          <p>This is the real article body with substantial content that exceeds the minimum threshold for saving.</p>
          <p>More content here to push past 200 meaningful characters of alphanumeric text in this article body.</p>
        </article>
      `
      const response = await sendMessage(messageListeners, { type: 'GET_STRUCTURED_CONTENT' })
      expect(response.markdown).toContain('Real Article')
      expect(response.markdown).toContain('real article body')
      expect(response.markdown).not.toContain('Menu links')
    })

    it('returns empty string (quality gate) for SPA/app pages with no readable content', async () => {
      // Simulates a React SPA shell with only decorative/navigation content.
      document.body.innerHTML = `
        <header><nav>Home About Contact</nav></header>
        <div id="app"><div class="spinner"></div></div>
        <footer>Copyright 2026</footer>
      `
      const response = await sendMessage(messageListeners, { type: 'GET_STRUCTURED_CONTENT' })
      // The quality gate should return '' when meaningful text is below the threshold.
      expect(response.markdown).toBe('')
    })

    it('returns empty string for a page dominated by nav links', async () => {
      // High link-density page — should be rejected by scoreContainer.
      document.body.innerHTML = `
        <main>
          <a href="/a">Link 1</a> <a href="/b">Link 2</a> <a href="/c">Link 3</a>
          <a href="/d">Link 4</a> <a href="/e">Link 5</a> <a href="/f">Link 6</a>
          <a href="/g">Link 7</a> <a href="/h">Link 8</a> <a href="/i">Link 9</a>
        </main>
      `
      const response = await sendMessage(messageListeners, { type: 'GET_STRUCTURED_CONTENT' })
      expect(response.markdown).toBe('')
    })

    it('prefers [role="main"] over generic body fallback', async () => {
      document.body.innerHTML = `
        <div>noise content noise content noise content that is long enough to look like body</div>
        <div role="main">
          <h2>Actual Main Content</h2>
          <p>This section has the real article text that we should be extracting for our notes system
          with enough length to pass the meaningful content threshold check in the quality gate function.</p>
        </div>
      `
      const response = await sendMessage(messageListeners, { type: 'GET_STRUCTURED_CONTENT' })
      expect(response.markdown).toContain('Actual Main Content')
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

  describe('error telemetry', () => {
    it('returns a structured { error } response when a sync handler throws', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      // Force getSelectionHtml() to throw deep in the handler.
      window.getSelection = vi.fn(() => {
        throw new Error('selection unavailable')
      })
      const response = await sendMessage(messageListeners, { type: 'GET_SELECTION_HTML' })
      expect(response).toEqual({ error: 'selection unavailable' })
      expect(warnSpy).toHaveBeenCalled()
    })

    it('relays a CONTENT_SCRIPT_ERROR to the service worker on failure', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const sendMessageSpy = vi.fn(() => ({ catch: () => {} }))
      globalThis.chrome.runtime.sendMessage = sendMessageSpy
      window.getSelection = vi.fn(() => {
        throw new Error('boom')
      })
      await sendMessage(messageListeners, { type: 'GET_SELECTION_MARKDOWN' })
      expect(sendMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CONTENT_SCRIPT_ERROR',
          payload: expect.objectContaining({ context: 'GET_SELECTION_MARKDOWN', message: 'boom' }),
        })
      )
    })

    it('does not throw when the relay channel is unavailable', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      // No chrome.runtime.sendMessage defined — reporter must swallow this.
      delete globalThis.chrome.runtime.sendMessage
      window.getSelection = vi.fn(() => {
        throw new Error('kaboom')
      })
      const response = await sendMessage(messageListeners, { type: 'GET_SELECTION_HTML' })
      expect(response).toEqual({ error: 'kaboom' })
    })
  })
})
