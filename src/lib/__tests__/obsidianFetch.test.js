import { beforeEach, describe, expect, it, vi } from 'vitest'

const { obsidianFetch, buildHttpFallbackUrl } = await import('../obsidianFetch.js')

/**
 * Build a minimal fetch Response-like object with iterable headers.
 */
function fakeResponse({ status = 200, body = '', headers = {} } = {}) {
  const entries = Object.entries(headers)
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
    headers: { forEach: (cb) => entries.forEach(([k, v]) => cb(v, k)) },
  }
}

describe('obsidianFetch — bridge transport v2 client', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  it('sends string bodies RAW with an explicit Content-Type (markdown writes)', async () => {
    globalThis.fetch.mockResolvedValueOnce(fakeResponse({ body: 'ok' }))

    await obsidianFetch('https://127.0.0.1:27124/vault/note.md', {
      token: 'obs-token',
      method: 'PUT',
      body: '# Raw markdown\n- not quoted\n',
      headers: { 'Content-Type': 'text/markdown', 'If-Match': '"etag-1"' },
    })

    const [url, opts] = globalThis.fetch.mock.calls[0]
    expect(url).toBe('https://127.0.0.1:27124/vault/note.md')
    // Raw body — NOT JSON-quoted (the v2.17 bug shape was '"# Raw..."')
    expect(opts.body).toBe('# Raw markdown\n- not quoted\n')
    // Explicit Content-Type wins over the application/json default
    expect(opts.headers['Content-Type']).toBe('text/markdown')
    expect(opts.headers['If-Match']).toBe('"etag-1"')
    expect(opts.headers.Authorization).toBe('Bearer obs-token')
  })

  it('JSON-stringifies object bodies and defaults Content-Type to application/json', async () => {
    globalThis.fetch.mockResolvedValueOnce(fakeResponse({ body: '[]' }))

    await obsidianFetch('https://127.0.0.1:27124/search/', {
      token: 'obs-token',
      method: 'POST',
      body: { and: [{ field: 'content', value: 'x' }] },
    })

    const [, opts] = globalThis.fetch.mock.calls[0]
    expect(opts.body).toBe(JSON.stringify({ and: [{ field: 'content', value: 'x' }] }))
    expect(opts.headers['Content-Type']).toBe('application/json')
  })

  it('returns upstream response headers for ETag relay', async () => {
    globalThis.fetch.mockResolvedValueOnce(fakeResponse({
      body: '# Hi',
      headers: { ETag: '"etag-abc"', 'Content-Type': 'text/markdown' },
    }))

    const result = await obsidianFetch('https://127.0.0.1:27124/vault/x.md', { token: 't' })

    expect(result.ok).toBe(true)
    expect(result.headers).toEqual({ ETag: '"etag-abc"', 'Content-Type': 'text/markdown' })
  })

  it('sends no body on GET requests', async () => {
    globalThis.fetch.mockResolvedValueOnce(fakeResponse())

    await obsidianFetch('https://127.0.0.1:27124/vault/', { token: 't', method: 'GET' })

    const [, opts] = globalThis.fetch.mock.calls[0]
    expect(opts.body).toBeUndefined()
    expect(opts.headers['Content-Type']).toBeUndefined()
  })

  it('builds the HTTP fallback URL from the documented ports', () => {
    expect(buildHttpFallbackUrl('https://127.0.0.1:27124/'))
      .toBe('http://127.0.0.1:27123/')
  })
})
