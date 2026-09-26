import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api.js', () => ({ getObsidianStatus: vi.fn() }))

let getSharedObsidianStatus, invalidateObsidianStatus, getObsidianStatus

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  ;({ getObsidianStatus } = await import('../api.js'))
  ;({ getSharedObsidianStatus, invalidateObsidianStatus } = await import('../obsidianStatus.js'))
})

/**
 * LIVENESS, not capability. The server contract answers "does this instance support
 * the vault at all" (static, gates visibility); this answers "is the bridge connected
 * right now" (dynamic, gates state). Keeping them apart is the point of the module —
 * conflating them is what left the Vault tab rendering on cloud.
 *
 * It exists because four components each fetched this independently on mount:
 * RelatedInVaultPanel, TagEditor, QuickNoteView, VaultBrowserView.
 */
describe('getSharedObsidianStatus — one liveness fetch, four consumers', () => {
  it('fetches once for concurrent callers', async () => {
    getObsidianStatus.mockResolvedValue({ connected: true, authenticated: true, status: 'ok' })
    const [a, b, c, d] = await Promise.all([
      getSharedObsidianStatus(), getSharedObsidianStatus(),
      getSharedObsidianStatus(), getSharedObsidianStatus(),
    ])
    expect(getObsidianStatus).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
    expect(c).toEqual(d)
    expect(a.connected).toBe(true)
  })

  it('serves from cache inside the TTL, refetches after it', async () => {
    getObsidianStatus.mockResolvedValue({ connected: true })
    await getSharedObsidianStatus()
    await getSharedObsidianStatus()
    expect(getObsidianStatus).toHaveBeenCalledTimes(1)
    vi.spyOn(Date, 'now').mockReturnValueOnce(Date.now() + 16_000)
    await getSharedObsidianStatus()
    expect(getObsidianStatus).toHaveBeenCalledTimes(2)
  })

  it('forceRefresh bypasses the cache — what a reconnect needs', async () => {
    getObsidianStatus.mockResolvedValue({ connected: true })
    await getSharedObsidianStatus()
    await getSharedObsidianStatus({ forceRefresh: true })
    expect(getObsidianStatus).toHaveBeenCalledTimes(2)
  })

  it('invalidateObsidianStatus forces the next call to refetch', async () => {
    getObsidianStatus.mockResolvedValue({ connected: true })
    await getSharedObsidianStatus()
    await invalidateObsidianStatus()
    await getSharedObsidianStatus()
    expect(getObsidianStatus).toHaveBeenCalledTimes(2)
  })

  it('resolves null on failure and does NOT poison the cache with the failure', async () => {
    // A bridge that blipped once must not pin four components to a cached error for
    // the whole TTL.
    getObsidianStatus.mockRejectedValue(new Error('bridge down'))
    expect(await getSharedObsidianStatus()).toBeNull()
    getObsidianStatus.mockResolvedValue({ connected: true })
    expect(await getSharedObsidianStatus()).toEqual({ connected: true })
  })

  it('a failed concurrent batch resolves null for every caller, then recovers', async () => {
    getObsidianStatus.mockRejectedValue(new Error('bridge down'))
    const results = await Promise.all([
      getSharedObsidianStatus(), getSharedObsidianStatus(), getSharedObsidianStatus(),
    ])
    expect(results).toEqual([null, null, null])
    expect(getObsidianStatus).toHaveBeenCalledTimes(1)   // still deduped while failing
  })

  it('never throws into a caller — a dead bridge must not break a popup render', async () => {
    getObsidianStatus.mockRejectedValue(new Error('network'))
    await expect(getSharedObsidianStatus()).resolves.toBeNull()
  })
})
