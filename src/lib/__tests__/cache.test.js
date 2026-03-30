import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock api module
vi.mock('../api.js', () => ({
  fetchCollections: vi.fn(),
  fetchTags: vi.fn(),
}))

function createStorageArea() {
  const store = new Map()
  return {
    async get(key) {
      if (Array.isArray(key)) {
        return Object.fromEntries(key.map(entry => [entry, store.get(entry)]))
      }
      return { [key]: store.get(key) }
    },
    async set(values) {
      for (const [key, value] of Object.entries(values)) store.set(key, value)
    },
    async remove(key) {
      store.delete(key)
    },
    _clear() {
      store.clear()
    },
    _store: store,
  }
}

describe('cache.js', () => {
  let local
  let getCollections, invalidateCollections, getTags, invalidateTags, getSettings, saveSettings
  let fetchCollections, fetchTags

  beforeEach(async () => {
    local = createStorageArea()
    vi.stubGlobal('chrome', { storage: { local } })

    // Reset module state between tests
    vi.resetModules()

    const apiMod = await import('../api.js')
    fetchCollections = apiMod.fetchCollections
    fetchTags = apiMod.fetchTags

    // Clear mock call history from prior tests
    fetchCollections.mockClear()
    fetchTags.mockClear()

    const cacheMod = await import('../cache.js')
    getCollections = cacheMod.getCollections
    invalidateCollections = cacheMod.invalidateCollections
    getTags = cacheMod.getTags
    invalidateTags = cacheMod.invalidateTags
    getSettings = cacheMod.getSettings
    saveSettings = cacheMod.saveSettings
  })

  // ── Collections ───────────────────────────────────────────────────────────

  it('fetches and caches collections on first call', async () => {
    const mockCols = [{ id: 1, name: 'Work' }, { id: 2, name: 'Personal' }]
    fetchCollections.mockResolvedValueOnce(mockCols)

    const result = await getCollections()
    expect(result).toEqual(mockCols)
    expect(fetchCollections).toHaveBeenCalledOnce()

    // Second call should use cache
    const result2 = await getCollections()
    expect(result2).toEqual(mockCols)
    expect(fetchCollections).toHaveBeenCalledOnce() // Not called again
  })

  it('force-refreshes collections when requested', async () => {
    const first = [{ id: 1, name: 'A' }]
    const second = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }]
    fetchCollections.mockResolvedValueOnce(first)
    fetchCollections.mockResolvedValueOnce(second)

    await getCollections()
    const result = await getCollections(true)
    expect(result).toEqual(second)
    expect(fetchCollections).toHaveBeenCalledTimes(2)
  })

  it('returns stale cache when fetch fails', async () => {
    const mockCols = [{ id: 1, name: 'Cached' }]
    fetchCollections.mockResolvedValueOnce(mockCols)
    await getCollections()

    // Expire the cache manually by overwriting fetchedAt
    const stored = await local.get('glassy_collections_cache')
    stored['glassy_collections_cache'].fetchedAt = 0
    await local.set(stored)

    // Now fetch fails
    fetchCollections.mockRejectedValueOnce(new Error('Network fail'))
    const result = await getCollections()
    expect(result).toEqual(mockCols)
  })

  it('returns empty array when fetch fails and no cache exists', async () => {
    fetchCollections.mockRejectedValueOnce(new Error('Network fail'))
    const result = await getCollections()
    expect(result).toEqual([])
  })

  it('invalidateCollections clears the cache', async () => {
    fetchCollections.mockResolvedValueOnce([{ id: 1, name: 'A' }])
    await getCollections()

    await invalidateCollections()

    // Next call should fetch again
    fetchCollections.mockResolvedValueOnce([{ id: 1, name: 'A' }, { id: 2, name: 'B' }])
    const result = await getCollections()
    expect(result).toHaveLength(2)
    expect(fetchCollections).toHaveBeenCalledTimes(2)
  })

  // ── Tags ──────────────────────────────────────────────────────────────────

  it('fetches and caches tags on first call', async () => {
    const mockTags = [{ name: 'react' }, { name: 'javascript' }]
    fetchTags.mockResolvedValueOnce({ tags: mockTags })

    const result = await getTags()
    expect(result).toEqual(mockTags)
    expect(fetchTags).toHaveBeenCalledOnce()
  })

  it('uses cached tags within TTL', async () => {
    fetchTags.mockResolvedValueOnce({ tags: ['tag1'] })
    await getTags()

    const result = await getTags()
    expect(result).toEqual(['tag1'])
    expect(fetchTags).toHaveBeenCalledOnce()
  })

  it('handles tag API returning flat array', async () => {
    fetchTags.mockResolvedValueOnce(['a', 'b', 'c'])
    const result = await getTags()
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('returns empty array when tag fetch fails with no cache', async () => {
    fetchTags.mockRejectedValueOnce(new Error('fail'))
    const result = await getTags()
    expect(result).toEqual([])
  })

  it('invalidateTags clears the tag cache', async () => {
    fetchTags.mockResolvedValueOnce({ tags: ['old'] })
    await getTags()
    await invalidateTags()

    fetchTags.mockResolvedValueOnce({ tags: ['new'] })
    const result = await getTags(true)
    expect(result).toEqual(['new'])
  })

  // ── Settings ──────────────────────────────────────────────────────────────

  it('returns defaults when no settings exist', async () => {
    const settings = await getSettings()
    expect(settings.aiAutoTag).toBe(true)
    expect(settings.showNotifications).toBe(true)
    expect(settings.badgeCount).toBe(true)
    expect(settings.defaultCollection).toBeNull()
  })

  it('merges saved settings with defaults', async () => {
    await saveSettings({ aiAutoTag: false })
    const settings = await getSettings()
    expect(settings.aiAutoTag).toBe(false)
    expect(settings.showNotifications).toBe(true) // default preserved
  })

  it('saveSettings preserves unmodified keys', async () => {
    await saveSettings({ aiAutoTag: false, showNotifications: false })
    await saveSettings({ aiAutoTag: true })
    const settings = await getSettings()
    expect(settings.aiAutoTag).toBe(true)
    expect(settings.showNotifications).toBe(false) // preserved from first save
  })
})
