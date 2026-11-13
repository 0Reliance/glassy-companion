/**
 * Unsent save forms, kept per page.
 *
 * There used to be one draft. The side panel stays open while the person moves between
 * pages, so the draft for page A was thrown away as "stale" the moment the form opened for
 * page B, and a note typed on A was lost by switching tabs to copy something. Drafts are now
 * kept per page address, the newest MAX_DRAFTS of them.
 *
 * Storage shape under `glassy_bookmark_draft`: `{ byUrl: { [url]: draft } }`. The older
 * shape, one draft with its `url`, is still read.
 */
export const BOOKMARK_DRAFT_KEY = 'glassy_bookmark_draft'
export const MAX_DRAFTS = 20

/** The draft for this page, or null. */
export function draftFor(stored, url) {
  if (!stored || !url) return null
  if (stored.byUrl && typeof stored.byUrl === 'object') return stored.byUrl[url] || null
  if (stored.url === url) return stored // the older single-draft shape
  return null
}

/** The stored value with this page's draft written (newest first, at most MAX_DRAFTS). */
export function withDraft(stored, url, draft, max = MAX_DRAFTS) {
  const byUrl = { ...toMap(stored) }
  byUrl[url] = { ...draft, url, savedAt: draft.savedAt ?? Date.now() }
  const keep = Object.values(byUrl).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)).slice(0, max)
  return { byUrl: Object.fromEntries(keep.map(d => [d.url, d])) }
}

/** The stored value without this page's draft; null when nothing is left. */
export function withoutDraft(stored, url) {
  const byUrl = { ...toMap(stored) }
  delete byUrl[url]
  return Object.keys(byUrl).length ? { byUrl } : null
}

function toMap(stored) {
  if (!stored) return {}
  if (stored.byUrl && typeof stored.byUrl === 'object') return stored.byUrl
  if (stored.url) return { [stored.url]: stored }
  return {}
}
