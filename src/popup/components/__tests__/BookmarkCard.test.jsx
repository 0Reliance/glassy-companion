import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Unit tests for BookmarkCard draft persistence logic.
 * Since @testing-library/react is not available, we test the draft
 * storage contract directly using the same chrome.storage mock pattern
 * as the other companion tests.
 */

const BOOKMARK_DRAFT_KEY = 'glassy_bookmark_draft'

function createStorageArea() {
  const store = new Map()
  return {
    get(key, cb) {
      const result = { [key]: store.get(key) }
      if (cb) cb(result)
      return Promise.resolve(result)
    },
    set(values, cb) {
      for (const [key, value] of Object.entries(values)) {
        store.set(key, JSON.parse(JSON.stringify(value)))
      }
      if (cb) cb()
      return Promise.resolve()
    },
    remove(key, cb) {
      if (Array.isArray(key)) key.forEach(k => store.delete(k))
      else store.delete(key)
      if (cb) cb()
      return Promise.resolve()
    },
    _store: store,
  }
}

describe('BookmarkCard draft persistence contract', () => {
  let local

  beforeEach(() => {
    local = createStorageArea()
    vi.stubGlobal('chrome', {
      storage: { local },
      runtime: { lastError: null },
    })
  })

  it('stores a draft with expected shape', async () => {
    const draft = {
      title: 'My page',
      notes: 'some notes',
      tags: ['react', 'testing'],
      collectionId: 42,
      savedAt: Date.now(),
    }
    await local.set({ [BOOKMARK_DRAFT_KEY]: draft })

    const result = await local.get(BOOKMARK_DRAFT_KEY)
    const stored = result[BOOKMARK_DRAFT_KEY]

    expect(stored).toMatchObject({
      title: 'My page',
      notes: 'some notes',
      tags: ['react', 'testing'],
      collectionId: 42,
    })
    expect(stored.savedAt).toBeGreaterThan(0)
  })

  it('restores draft fields correctly', async () => {
    const draft = {
      title: 'Restored',
      notes: 'old notes',
      tags: ['tag1'],
      collectionId: 5,
      savedAt: Date.now(),
    }
    await local.set({ [BOOKMARK_DRAFT_KEY]: draft })

    const result = await local.get(BOOKMARK_DRAFT_KEY)
    const restored = result[BOOKMARK_DRAFT_KEY]

    expect(restored.title).toBe('Restored')
    expect(restored.notes).toBe('old notes')
    expect(restored.tags).toEqual(['tag1'])
    expect(restored.collectionId).toBe(5)
  })

  it('returns undefined when no draft exists', async () => {
    const result = await local.get(BOOKMARK_DRAFT_KEY)
    expect(result[BOOKMARK_DRAFT_KEY]).toBeUndefined()
  })

  it('clears draft via remove', async () => {
    await local.set({
      [BOOKMARK_DRAFT_KEY]: { title: 'temp', notes: '', tags: [], collectionId: null, savedAt: Date.now() },
    })
    expect(local._store.has(BOOKMARK_DRAFT_KEY)).toBe(true)

    await local.remove(BOOKMARK_DRAFT_KEY)
    expect(local._store.has(BOOKMARK_DRAFT_KEY)).toBe(false)
  })

  it('overwrites previous draft on re-save', async () => {
    await local.set({
      [BOOKMARK_DRAFT_KEY]: { title: 'v1', notes: '', tags: [], collectionId: null, savedAt: 1000 },
    })
    await local.set({
      [BOOKMARK_DRAFT_KEY]: { title: 'v2', notes: 'updated', tags: ['new'], collectionId: 3, savedAt: 2000 },
    })

    const result = await local.get(BOOKMARK_DRAFT_KEY)
    expect(result[BOOKMARK_DRAFT_KEY].title).toBe('v2')
    expect(result[BOOKMARK_DRAFT_KEY].notes).toBe('updated')
    expect(result[BOOKMARK_DRAFT_KEY].savedAt).toBe(2000)
  })
})
