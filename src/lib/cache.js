/**
 * Collections cache — stores the user's bookmark collections in
 * chrome.storage.local with a 5-minute TTL to avoid fetching on every popup open.
 */
import { STORAGE_KEYS, COLLECTIONS_CACHE_TTL_MS } from './constants.js'
import { fetchCollections, fetchTags } from './api.js'

const CACHE_KEY = 'glassy_collections_cache'
const TAGS_CACHE_KEY = 'glassy_tags_cache'
const TAGS_CACHE_TTL_MS = 10 * 60 * 1000  // 10 minutes

/** Return cached collections if still fresh, otherwise fetch + cache. */
export async function getCollections(forceRefresh = false) {
  if (!forceRefresh) {
    const stored = await chrome.storage.local.get(CACHE_KEY)
    const cached = stored[CACHE_KEY]
    if (cached && Date.now() - cached.fetchedAt < COLLECTIONS_CACHE_TTL_MS) {
      return cached.data
    }
  }

  try {
    const data = await fetchCollections()
    await chrome.storage.local.set({
      [CACHE_KEY]: { data, fetchedAt: Date.now() },
    })
    return data
  } catch {
    // Return stale cache rather than failing silently
    const stored = await chrome.storage.local.get(CACHE_KEY)
    return stored[CACHE_KEY]?.data || []
  }
}

/** Invalidate the collections cache (call after creating/modifying a collection). */
export async function invalidateCollections() {
  await chrome.storage.local.remove(CACHE_KEY)
}

/** Get extension settings (defaults applied). */
export async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.settings)
  return {
    aiAutoTag: true,
    showQuickActions: true,
    defaultCollection: null,
    badgeCount: true,
    showNotifications: true,
    ...result[STORAGE_KEYS.settings],
  }
}

/** Save partial settings update. */
export async function saveSettings(partial) {
  const current = await getSettings()
  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: { ...current, ...partial },
  })
}

/** Return cached tags if still fresh, otherwise fetch + cache. */
export async function getTags(forceRefresh = false) {
  if (!forceRefresh) {
    const stored = await chrome.storage.local.get(TAGS_CACHE_KEY)
    const cached = stored[TAGS_CACHE_KEY]
    if (cached && Date.now() - cached.fetchedAt < TAGS_CACHE_TTL_MS) {
      return cached.data
    }
  }

  try {
    const data = await fetchTags()
    const tags = data?.tags || data || []
    await chrome.storage.local.set({
      [TAGS_CACHE_KEY]: { data: tags, fetchedAt: Date.now() },
    })
    return tags
  } catch {
    const stored = await chrome.storage.local.get(TAGS_CACHE_KEY)
    return stored[TAGS_CACHE_KEY]?.data || []
  }
}

/** Invalidate tags cache. */
export async function invalidateTags() {
  await chrome.storage.local.remove(TAGS_CACHE_KEY)
}
