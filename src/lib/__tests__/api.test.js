import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

// Mock auth module before importing api
vi.mock('../auth.js', () => ({
  getToken: vi.fn(() => Promise.resolve('test-token')),
  getBaseUrl: vi.fn(() => Promise.resolve('https://glassy.test')),
  getActiveAccountId: vi.fn(() => Promise.resolve('acc-1')),
  clearAuth: vi.fn(),
}))

const {
  fetchMe,
  checkUrl,
  fetchCollections,
  fetchTags,
  createCollection,
  saveBookmark,
  saveDocument,
  ApiError,
} = await import('../api.js')
const { clearAuth, getBaseUrl } = await import('../auth.js')

describe('api.js — apiFetch wrapper', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    getBaseUrl.mockResolvedValue('https://glassy.test')
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('wraps network failures in ApiError with status 0 after retry', async () => {
    globalThis.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    globalThis.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const assertion = expect(fetchMe()).rejects.toMatchObject({
      status: 0,
      message: 'Failed to fetch',
    })
    await vi.runAllTimersAsync()
    await assertion
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
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
      status: 400,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    })

    await expect(fetchMe()).rejects.toMatchObject({
      status: 400,
      message: 'Request failed (400)',
    })
  })

  it('returns null for 204 No Content', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
    })

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

  it('rejects immediately when baseUrl uses http:// (not localhost)', async () => {
    getBaseUrl.mockResolvedValueOnce('http://evil.example.com')

    await expect(fetchMe()).rejects.toMatchObject({
      status: 0,
      message: 'Server URL must use HTTPS.',
    })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('allows http://localhost for development', async () => {
    getBaseUrl.mockResolvedValueOnce('http://localhost:3000')
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ user: { id: 1 } }),
    })

    const result = await fetchMe()
    expect(result).toEqual({ user: { id: 1 } })
  })

  it('throws ApiError with timed-out message on AbortError', async () => {
    const abortErr = new DOMException('The user aborted a request.', 'AbortError')
    globalThis.fetch.mockRejectedValueOnce(abortErr)

    await expect(fetchMe()).rejects.toMatchObject({
      status: 0,
      message: 'Request timed out.',
    })
    // AbortError should NOT be retried
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('retries once on 5xx and succeeds', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ error: 'Service Unavailable' }),
    })
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ user: { id: 1 } }),
    })

    const promise = fetchMe()
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toEqual({ user: { id: 1 } })
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('throws after two consecutive 5xx responses', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ error: 'Service Unavailable' }),
    })

    const assertion = expect(fetchMe()).rejects.toMatchObject({ status: 503 })
    await vi.runAllTimersAsync()
    await assertion
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('passes AbortSignal to fetch', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    })

    await fetchMe()

    const [, opts] = globalThis.fetch.mock.calls[0]
    expect(opts.signal).toBeInstanceOf(AbortSignal)
  })

  it('ApiError is exported and instanceof-able', () => {
    const err = new ApiError(404, 'Not found')
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toBeInstanceOf(Error)
    expect(err.status).toBe(404)
    expect(err.message).toBe('Not found')
  })

  it('saveDocument sends POST to /api/ext/documents', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'doc-1' }),
    })

    const result = await saveDocument({ url: 'https://example.com', title: 'Test' })

    const [url, opts] = globalThis.fetch.mock.calls[0]
    expect(url).toContain('/api/ext/documents')
    expect(opts.method).toBe('POST')
    expect(result).toEqual({ id: 'doc-1' })
  })
})
