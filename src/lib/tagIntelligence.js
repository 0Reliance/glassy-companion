/**
 * Tag Intelligence — local tag frequency tracking and heuristic suggestions.
 *
 * Maintains a local frequency map of user tags so the autocomplete
 * dropdown can rank suggestions by usage count, and provides fallback
 * keyword extraction when server-side AI auto-tag is unavailable.
 */

const TAG_FREQ_KEY = 'glassy_tag_frequencies'

/**
 * @typedef {{ [tagName: string]: { count: number, lastUsed: number } }} TagFreqMap
 */

/** Load the tag frequency map from storage. */
async function loadFreqMap() {
  try {
    const result = await chrome.storage.local.get(TAG_FREQ_KEY)
    return result[TAG_FREQ_KEY] || {}
  } catch {
    return {}
  }
}

/** Save the tag frequency map to storage. */
async function saveFreqMap(map) {
  try {
    // Cap at 200 entries to prevent unbounded growth.
    const entries = Object.entries(map)
    if (entries.length > 200) {
      entries.sort((a, b) => b[1].count - a[1].count)
      const trimmed = Object.fromEntries(entries.slice(0, 200))
      await chrome.storage.local.set({ [TAG_FREQ_KEY]: trimmed })
      return
    }
    await chrome.storage.local.set({ [TAG_FREQ_KEY]: map })
  } catch {}
}

/** Record a tag usage (increment count, update timestamp). */
export async function recordTagUsage(tagNames) {
  if (!Array.isArray(tagNames) || tagNames.length === 0) return
  const map = await loadFreqMap()
  const now = Date.now()
  for (const name of tagNames) {
    const key = normalizeTagKey(name)
    map[key] = {
      count: (map[key]?.count || 0) + 1,
      lastUsed: now,
    }
  }
  await saveFreqMap(map)
}

/** Get tags sorted by frequency (most-used first), then alphabetically. */
export async function getSuggestedTags() {
  const map = await loadFreqMap()
  return Object.entries(map)
    .sort((a, b) => {
      // Primary sort: frequency
      if (b[1].count !== a[1].count) return b[1].count - a[1].count
      // Secondary: most recently used
      return b[1].lastUsed - a[1].lastUsed
    })
    .map(([name]) => name)
}

/** Get the usage count for a specific tag. */
export async function getTagUsageCount(tagName) {
  const map = await loadFreqMap()
  const key = normalizeTagKey(tagName)
  return map[key]?.count || 0
}

/** Extract potential tags from title + description using simple keyword extraction. */
export function extractKeywordTags(title, description) {
  if (!title && !description) return []
  const text = `${title || ''} ${description || ''}`.toLowerCase()
  // Common tech/productivity keywords
  const knownKeywords = [
    'javascript', 'typescript', 'python', 'rust', 'go', 'react', 'vue', 'angular',
    'ai', 'machine-learning', 'llm', 'api', 'database', 'devops', 'docker',
    'design', 'ux', 'css', 'html', 'node', 'deno', 'bun',
    'newsletter', 'tutorial', 'guide', 'review', 'comparison',
    'productivity', 'writing', 'research', 'finance', 'health',
    'open-source', 'github', 'security', 'performance', 'accessibility',
    'startup', 'business', 'marketing', 'podcast', 'video',
  ]
  const found = []
  for (const kw of knownKeywords) {
    if (text.includes(kw)) found.push(kw)
  }
  return found.slice(0, 8)
}

/** Normalize tag to a consistent key for the frequency map. */
function normalizeTagKey(raw) {
  return (typeof raw === 'string' ? raw : raw.name || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
}
