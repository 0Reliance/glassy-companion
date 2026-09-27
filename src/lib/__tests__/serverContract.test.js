import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api.js', () => ({ fetchManifest: vi.fn() }))
vi.mock('../auth.js', () => ({ getBaseUrl: vi.fn(() => Promise.resolve('https://glassy.test')) }))

// Copied verbatim from cache.test.js — reuse the house storage mock, don't invent a
// second one. Note it implements get(key) for a string or an array, NOT get(null);
// that is why the contract caches under ONE key carrying baseUrl inside the entry.
function createStorageArea() {
  const store = new Map()
  return {
    async get(key) {
      if (Array.isArray(key)) return Object.fromEntries(key.map(e => [e, store.get(e)]))
      return { [key]: store.get(key) }
    },
    async set(values) { for (const [k, v] of Object.entries(values)) store.set(k, v) },
    async remove(key) { for (const k of (Array.isArray(key) ? key : [key])) store.delete(k) },
    _store: store,
  }
}

// LIVE CAPTURES, not invented bodies. See fixtures/README.md for provenance. The
// interpretStatus defect this suite exists to prevent was certified by a hand-written
// fixture describing a response no server had ever sent.
const cloud = (await import('./fixtures/manifest-cloud.json')).default                 // v2.40.5 public
const selfHost = (await import('./fixtures/manifest-selfhost.json')).default           // v2.40.5 self_hosted
// What app.glassy.fyi actually serves today: an older manifest with no `mounted` and no
// `vault` keys at all. Kept because "absent" and "false" are different inputs that must
// produce the same fail-closed answer, and only a real old manifest proves that.
const cloudLegacy = (await import('./fixtures/manifest-cloud-v2.40.0.json')).default   // v2.40.0 public

let local, getServerContract, invalidateServerContract, projectContract, FAIL_CLOSED, fetchManifest, getBaseUrl

beforeEach(async () => {
  local = createStorageArea()
  vi.stubGlobal('chrome', { storage: { local } })
  vi.resetModules()                       // clear the module-level in-flight promise
  vi.clearAllMocks()
  ;({ fetchManifest } = await import('../api.js'))
  ;({ getBaseUrl } = await import('../auth.js'))
  getBaseUrl.mockResolvedValue('https://glassy.test')
  ;({ getServerContract, invalidateServerContract, projectContract, FAIL_CLOSED } =
      await import('../serverContract.js'))
})

describe('projectContract — capability predicates against live-captured fixtures', () => {
  it('appliance: mcp available because mounted is true, agentIdentity named-keys', () => {
    const c = projectContract(selfHost)
    expect(c.mcp.available).toBe(true)
    expect(c.mcp.enabled).toBe(true)
    expect(c.mcp.tools).toBe(40)
    expect(c.agentIdentity).toEqual({ available: true, mode: 'named-keys' })
    expect(c.notifications.available).toBe(true)
    expect(c.instanceId).toBe('self_hosted')
    expect(c.deploymentLocality).toBe('local')
    expect(c.version).toBe(selfHost.version)   // retained, not discarded
    expect(c.resolved).toBe(true)
  })

  it('cloud: mcp UNavailable — and ABSENT and false both resolve the same way', () => {
    // The whole point of `=== true`. v2.40.5 cloud publishes mounted:false; the older
    // manifest app.glassy.fyi serves today publishes no mounted key at all. Both must
    // read as unavailable — treating absence as available is interpretStatus inverted.
    expect(selfHost.capabilities.mcp.mounted).toBe(true)
    expect(cloud.capabilities.mcp.mounted).toBe(false)
    expect(cloudLegacy.capabilities.mcp.mounted).toBeUndefined()

    const c = projectContract(cloud)
    expect(c.mcp.available).toBe(false)
    expect(c.mcp.enabled).toBe(false)
    expect(c.agentIdentity).toEqual({ available: false, mode: 'single-key' })
    expect(c.notifications.available).toBe(false)
    expect(c.instanceId).toBe('public')

    // The legacy manifest must project identically on every gate. This is the arm that
    // protects an extension pointed at the public origin as it stands today.
    const legacy = projectContract(cloudLegacy)
    expect(legacy.mcp.available).toBe(false)
    expect(legacy.vault.available).toBe(false)
    expect(legacy.notifications.available).toBe(false)
    expect(legacy.agentIdentity.mode).toBe('single-key')
    expect(legacy.version).toBe('2.40.0')
  })

  it('vault follows the manifest — available on the appliance, withheld on cloud', () => {
    // Proven against BOTH live v2.40.5 captures, not an invented body. This assertion
    // was impossible before the server published the key: the positive arm is a real
    // appliance manifest, and the negative arm is a real cloud one.
    expect(selfHost.capabilities.vault).toEqual({ available: true })
    expect(cloud.capabilities.vault).toEqual({ available: false })
    expect(projectContract(selfHost).vault.available).toBe(true)
    expect(projectContract(cloud).vault.available).toBe(false)
    // And an older server that publishes no vault key at all still fails closed,
    // rather than guessing from deploymentLocality or instanceId.
    expect(cloudLegacy.capabilities.vault).toBeUndefined()
    expect(projectContract(cloudLegacy).vault.available).toBe(false)
  })

  it('a malformed or empty manifest projects fail-closed and never throws', () => {
    for (const bad of [undefined, null, {}, { capabilities: null }, { capabilities: 'nope' },
                       { capabilities: { mcp: 'x', vault: 3, notifications: [], agentIdentity: 'y' } }]) {
      const c = projectContract(bad)
      expect(c.mcp.available).toBe(false)
      expect(c.vault.available).toBe(false)
      expect(c.notifications.available).toBe(false)
      expect(c.agentIdentity.mode).toBe('single-key')
      expect(c.version).toBeNull()
      expect(c.resolved).toBe(true)          // projected fine; trust is carried by `stale`
    }
  })

  it('returns a frozen contract, so one consumer cannot mutate another’s view', () => {
    const c = projectContract(selfHost)
    expect(Object.isFrozen(c)).toBe(true)
    expect(Object.isFrozen(c.mcp)).toBe(true)
    expect(Object.isFrozen(FAIL_CLOSED)).toBe(true)
  })
})

describe('getServerContract — cache, dedupe, staleness', () => {
  it('fetches once, then serves from cache inside the TTL', async () => {
    fetchManifest.mockResolvedValue(selfHost)
    await getServerContract()
    await getServerContract()
    expect(fetchManifest).toHaveBeenCalledTimes(1)
    expect(local._store.has('glassy_server_contract')).toBe(true)
  })

  it('dedupes CONCURRENT callers into one fetch', async () => {
    // Popup.jsx and McpConnectionSection.jsx each mount a hook today: two manifest
    // fetches per popup open. The in-flight promise must collapse them.
    fetchManifest.mockResolvedValue(selfHost)
    const [a, b] = await Promise.all([getServerContract(), getServerContract()])
    expect(fetchManifest).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
  })

  it('refetches after the TTL expires', async () => {
    fetchManifest.mockResolvedValue(selfHost)
    await getServerContract()
    vi.spyOn(Date, 'now').mockReturnValueOnce(Date.now() + 31_000)
    await getServerContract()
    expect(fetchManifest).toHaveBeenCalledTimes(2)
  })

  it('forceRefresh bypasses a fresh cache', async () => {
    fetchManifest.mockResolvedValue(selfHost)
    await getServerContract()
    await getServerContract({ forceRefresh: true })
    expect(fetchManifest).toHaveBeenCalledTimes(2)
  })

  it('a baseUrl change is a cache MISS — no stale cloud manifest on a self-host switch', async () => {
    fetchManifest.mockResolvedValue(cloud)
    const before = await getServerContract()
    expect(before.mcp.available).toBe(false)

    getBaseUrl.mockResolvedValue('http://192.168.1.20:8080')
    fetchManifest.mockResolvedValue(selfHost)
    const after = await getServerContract()
    expect(fetchManifest).toHaveBeenCalledTimes(2)
    expect(after.mcp.available).toBe(true)
  })

  it('STALE-ON-ERROR: a failed refetch returns the cached contract marked stale', async () => {
    // Matches cache.js getCollections(). A transient blip must not silently disable
    // every self-host feature. Still safe: a stale CLOUD contract says available:false.
    fetchManifest.mockResolvedValue(selfHost)
    await getServerContract()
    vi.spyOn(Date, 'now').mockReturnValueOnce(Date.now() + 31_000)
    fetchManifest.mockRejectedValue(new Error('network down'))
    const c = await getServerContract()
    expect(c.stale).toBe(true)
    expect(c.mcp.available).toBe(true)
  })

  it('FAILS CLOSED when there is nothing cached and the fetch fails', async () => {
    fetchManifest.mockRejectedValue(new Error('network down'))
    const c = await getServerContract()
    expect(c).toEqual(FAIL_CLOSED)
    expect(c.resolved).toBe(false)
    expect(c.mcp.available).toBe(false)
    expect(c.vault.available).toBe(false)
  })

  it('invalidateServerContract forces a refetch', async () => {
    fetchManifest.mockResolvedValue(selfHost)
    await getServerContract()
    await invalidateServerContract()
    expect(local._store.has('glassy_server_contract')).toBe(false)
    await getServerContract()
    expect(fetchManifest).toHaveBeenCalledTimes(2)
  })

  it('survives storage being unavailable — a write failure must not fail the read', async () => {
    // Chrome can throw on storage under pressure; capability gating must be slowed by
    // a broken cache, never broken by one.
    vi.stubGlobal('chrome', { storage: { local: {
      get: async () => { throw new Error('storage down') },
      set: async () => { throw new Error('storage down') },
      remove: async () => { throw new Error('storage down') },
    } } })
    fetchManifest.mockResolvedValue(selfHost)
    const c = await getServerContract()
    expect(c.mcp.available).toBe(true)
  })
})

