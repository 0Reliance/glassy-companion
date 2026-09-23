import { beforeEach, describe, expect, it, vi } from 'vitest'

// The house mock pattern (api.test.js): auth is mocked before importing api.
vi.mock('../auth.js', () => ({
  getToken: vi.fn(() => Promise.resolve('test-token')),
  getBaseUrl: vi.fn(() => Promise.resolve('https://glassy.test')),
  getActiveAccountId: vi.fn(() => Promise.resolve('acc-1')),
  getApiContext: vi.fn(() => Promise.resolve({ baseUrl: 'https://glassy.test', activeAccountId: 'acc-1' })),
  clearAuth: vi.fn(),
}))

const {
  fetchCapabilities,
  DEFAULT_CAPABILITIES,
  createNamedMcpKey,
  fetchUnreadNotifications,
} = await import('../api.js')

describe('fetchCapabilities — the client-side capability gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn()
  })

  it('parses the manifest when the server answers', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ capabilities: { agentIdentity: { available: true, mode: 'named-keys' }, notifications: { available: true } } }),
    })
    const caps = await fetchCapabilities()
    expect(caps.agentIdentity).toEqual({ available: true, mode: 'named-keys' })
    expect(caps.notifications).toEqual({ available: true })
  })

  it('FAILS CLOSED on any error — the split rule applies to clients too', async () => {
    globalThis.fetch.mockRejectedValueOnce(new Error('network down'))
    const caps = await fetchCapabilities()
    expect(caps).toEqual(DEFAULT_CAPABILITIES)
    expect(caps.agentIdentity.available).toBe(false)
    expect(caps.notifications.available).toBe(false)
  })

  it('fails closed on a non-200 or malformed body', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    expect(await fetchCapabilities()).toEqual(DEFAULT_CAPABILITIES)
    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => 'not json shape' })
    expect(await fetchCapabilities()).toEqual(DEFAULT_CAPABILITIES)
  })
})

describe('createNamedMcpKey — the companion becomes a verified principal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn()
  })

  it('POSTs /api/mcp-keys with the agent name', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true, status: 201,
      json: async () => ({ id: 'key-1', key: 'gky_live_xxx', agentName: 'Companion' }),
    })
    const res = await createNamedMcpKey({ agentName: 'Companion' })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://glassy.test/api/mcp-keys',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ agentName: 'Companion' }),
      })
    )
    expect(res.agentName).toBe('Companion')
  })

  it('surfaces a duplicate-name 409 as an ApiError with the message', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: false, status: 409,
      json: async () => ({ error: 'DUPLICATE_NAME', message: 'A key named Companion already exists.' }),
    })
    await expect(createNamedMcpKey({ agentName: 'Companion' })).rejects.toMatchObject({ status: 409 })
  })
})

describe('fetchUnreadNotifications — the awareness lane in the browser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn()
  })

  it('reads /api/notifications?unread=1 and returns { notifications, unreadCount }', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications: [{ id: 'n1', from_agent: 'Hermes', message: 'sync done' }], unreadCount: 1 }),
    })
    const res = await fetchUnreadNotifications()
    expect(res.unreadCount).toBe(1)
    expect(res.notifications).toHaveLength(1)
    const [url, opts] = globalThis.fetch.mock.calls[0]
    expect(url).toContain('/api/notifications?unread=1')
    expect(opts.method || 'GET').toBe('GET')
  })

  it('fails closed: an error answer yields zero, never a throw into the badge', async () => {
    globalThis.fetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const res = await fetchUnreadNotifications()
    expect(res).toEqual({ notifications: [], unreadCount: 0 })
  })
})