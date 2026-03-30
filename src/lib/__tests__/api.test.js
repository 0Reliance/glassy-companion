import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock auth module before importing api
vi.mock('../auth.js', () => ({
  getToken: vi.fn(() => Promise.resolve('test-token')),
  getBaseUrl: vi.fn(() => Promise.resolve('https://glassy.test')),
  getActiveAccountId: vi.fn(() => Promise.resolve('acc-1')),
  clearAuth: vi.fn(),
}))

const { fetchMe, checkUrl, fetchCollections, fetchTags, createCollection, saveBookmark } = await import('../api.js')
const { clearAuth } = await import('../auth.js')

describe('api.js — apiFetch wrapper', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    globalThis.fetch = vi.fn()
  })

  it('sends auth headers on every request', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ user: { id: 1 } }),
    })

    await fetchMe()

    expect(globalThis.fetch).toHaveBeenCalledOnce()
    const [url, opts] = globalThis.fetch.mock.calls[0]
    expect(url).toBe('https://glassy.test/api/ext/me')
    expect(opts.headers.Authorization).toBe('Bearer test-token')
    expect(opts.headers['X-Account-Id']).toBe('acc-1')
  })

  it('wraps network failures in ApiError with status 0', async () => {
    globalThis.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(fetchMe()).rejects.toMatchObject({
      status: 0,
      message: 'Failed to fetch',
    })
  })

  it('handles 401 by clearing auth and throwing', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    })

    await expect(fetchMe()).rejects.toMatchObject({
      status: 401,
    })
    expect(clearAuth).toHaveBeenCalledOnce()
  })

  it('parses error message from JSON response body', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ error: 'Validation failed: title too long' }),
    })

    await expect(saveBookmark({ url: 'https://x.test' })).rejects.toMatchObject({
      status: 422,
      message: 'Validation failed: title too long',
    })
  })

  it('handles non-JSON error responses gracefully', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    })

    await expect(fetchMe()).rejects.toMatchObject({
      status: 502,
      message: 'Request failed (502)',
    })
  })

  it('returns null for 204 No Content', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
    })

    // deleteBookmark returns apiFetch which should return null on 204
    const { deleteBookmark } = await import('../api.js')
    const result = await deleteBookmark('123')
    expect(result).toBeNull()
  })

  it('handles non-JSON success responses without crashing', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Not JSON')),
    })

    const result = await fetchMe()
    expect(result).toBeNull()
  })

  it('encodes URL parameter for checkUrl', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ exists: true }),
    })

    await checkUrl('https://example.com/path?q=hello world')

    const [url] = globalThis.fetch.mock.calls[0]
    expect(url).toContain('/api/ext/check-url?url=')
    expect(url).toContain(encodeURIComponent('https://example.com/path?q=hello world'))
  })

  it('sends POST body as JSON for createCollection', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'col-1', name: 'Test' }),
    })

    const result = await createCollection('Test')

    const [, opts] = globalThis.fetch.mock.calls[0]
    expect(opts.method).toBe('POST')
    expect(opts.body).toBe(JSON.stringify({ name: 'Test' }))
    expect(result).toEqual({ id: 'col-1', name: 'Test' })
  })
})
