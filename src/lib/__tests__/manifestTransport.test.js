import { beforeEach, describe, expect, it, vi } from 'vitest'

// House mock pattern: auth is mocked before importing api.
vi.mock('../auth.js', () => ({
  getToken: vi.fn(() => Promise.resolve('test-token')),
  getBaseUrl: vi.fn(() => Promise.resolve('https://glassy.test')),
  getActiveAccountId: vi.fn(() => Promise.resolve('acc-1')),
  getApiContext: vi.fn(() => Promise.resolve({ baseUrl: 'https://glassy.test', activeAccountId: 'acc-1' })),
  clearAuth: vi.fn(),
}))

const { fetchManifest, ApiError } = await import('../api.js')
const cloud = (await import('./fixtures/manifest-cloud.json')).default
const selfHost = (await import('./fixtures/manifest-selfhost.json')).default

const jsonRes = (body, ok = true, status = 200) => ({
  ok, status, headers: { get: () => 'application/json' }, json: async () => body,
})

/**
 * fetchManifest is raw transport on purpose. Every decision about what a failed or
 * partial manifest MEANS lives in lib/serverContract.js, so exactly one place
 * interprets the server. The previous fetchCapabilities projected to 2 of ~9 keys,
 * discarded `version`, and swallowed every error into fail-closed defaults — which is
 * how a client ends up guessing at contracts instead of reading them.
 */
describe('fetchManifest — raw transport for the server contract', () => {
  beforeEach(() => { vi.clearAllMocks(); globalThis.fetch = vi.fn() })

  it('returns the WHOLE manifest, not a projection — the version is the point', async () => {
    // The server publishes `version` explicitly "so an agent can tell two instances
    // apart". The old projection threw it away.
    globalThis.fetch.mockResolvedValueOnce(jsonRes(selfHost))
    const m = await fetchManifest()
    expect(m.version).toBe(selfHost.version)
    expect(m.instanceId).toBe('self_hosted')
    expect(m.deploymentLocality).toBe('local')
    expect(m.capabilities.mcp.mounted).toBe(true)
    expect(m.capabilities.agentIdentity.mode).toBe('named-keys')
  })

  it('preserves the cloud fixture verbatim, including keys that are ABSENT', async () => {
    // Cloud v2.40.0 has no mcp.mounted and no vault. Absence must survive transport so
    // the contract can fail closed on it rather than on a defaulted-in false.
    globalThis.fetch.mockResolvedValueOnce(jsonRes(cloud))
    const m = await fetchManifest()
    expect(m.capabilities.mcp.mounted).toBeUndefined()
    expect(m.capabilities.vault).toBeUndefined()
    expect(m.instanceId).toBe('public')
  })

  it('does not use apiFetch: no Authorization header, no clearAuth side effect', async () => {
    // The manifest is public and must be readable pre-login so it can gate the login
    // screen; a stale JWT must not log the user out as a side effect of reading it.
    const { clearAuth } = await import('../auth.js')
    globalThis.fetch.mockResolvedValueOnce(jsonRes(cloud))
    await fetchManifest()
    const [url, opts] = globalThis.fetch.mock.calls[0]
    expect(url).toBe('https://glassy.test/api/capabilities')
    expect(opts?.headers?.Authorization).toBeUndefined()
    expect(clearAuth).not.toHaveBeenCalled()
  })

  it('THROWS on non-ok — meaning is the contract’s job, not the transport’s', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonRes({}, false, 404))
    await expect(fetchManifest()).rejects.toBeInstanceOf(ApiError)
  })

  it('THROWS on a malformed body rather than returning a half object', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonRes({ version: '1' }))   // no capabilities
    await expect(fetchManifest()).rejects.toThrow(/malformed/i)

    globalThis.fetch.mockResolvedValueOnce(jsonRes({ capabilities: 'nope' }))
    await expect(fetchManifest()).rejects.toThrow(/malformed/i)
  })

  it('THROWS when no server URL is configured', async () => {
    const { getBaseUrl } = await import('../auth.js')
    getBaseUrl.mockResolvedValueOnce('')
    await expect(fetchManifest()).rejects.toBeInstanceOf(ApiError)
  })

  it('bounds the request — no unbounded fetch enters this codebase again', async () => {
    // The /mcp/status probe this replaces had no AbortController at all, so a hung
    // server left the MCP settings pane on "Checking…" forever.
    globalThis.fetch.mockImplementationOnce((_u, opts) => {
      expect(opts.signal).toBeInstanceOf(AbortSignal)
      return Promise.resolve(jsonRes(cloud))
    })
    await fetchManifest()
  })
})
