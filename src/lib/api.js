/**
 * Glassy API client — authenticated fetch wrapper for extension API routes.
 * Reads the token from chrome.storage.session on each call.
 */
import { getToken, getBaseUrl, getActiveAccountId, clearAuth } from './auth.js'

/**
 * Core fetch wrapper. Handles auth headers, JSON encoding,
 * and 401 → clear token flow.
 */
async function apiFetch(path, options = {}) {
  const token = await getToken()
  const baseUrl = await getBaseUrl()
  const activeAccountId = await getActiveAccountId()
  const url = `${baseUrl}${path}`

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(activeAccountId ? { 'X-Account-Id': activeAccountId } : {}),
    ...options.headers,
  }

  let res
  try {
    res = await fetch(url, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
  } catch (networkErr) {
    throw new ApiError(0, networkErr.message || 'Network request failed')
  }

  if (res.status === 401) {
    await clearAuth()
    throw new ApiError(401, 'Session expired. Please log in again.')
  }

  if (!res.ok) {
    let errMsg = `Request failed (${res.status})`
    try {
      const errData = await res.json()
      errMsg = errData.error || errData.message || errMsg
    } catch {}
    throw new ApiError(res.status, errMsg)
  }

  // 204 No Content
  if (res.status === 204) return null
  try {
    return await res.json()
  } catch {
    return null
  }
}

class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// ── Extension API ──────────────────────────────────────────────────────────────

/** GET /api/ext/me — fetch current user with entitlements and Keep stats. */
export function fetchMe() {
  return apiFetch('/api/ext/me')
}

/** GET /api/ext/ping — health check (no auth required). */
export async function pingServer() {
  const baseUrl = await getBaseUrl()
  const res = await fetch(`${baseUrl}/api/ext/ping`)
  return res.ok
}

/** GET /api/ext/collections — list user bookmark collections. */
export function fetchCollections() {
  return apiFetch('/api/ext/collections')
}

/** GET /api/ext/check-url?url= — check if URL already saved. */
export function checkUrl(url) {
  return apiFetch(`/api/ext/check-url?url=${encodeURIComponent(url)}`)
}

/**
 * POST /api/ext/bookmarks — save a bookmark.
 * @param {object} payload
 * @param {string} payload.url
 * @param {string} [payload.title] - pre-extracted title (extension provides it)
 * @param {string} [payload.description]
 * @param {string} [payload.og_image]
 * @param {string} [payload.favicon_url]
 * @param {string} [payload.domain]
 * @param {string[]} [payload.tags]
 * @param {number|null} [payload.collection_id]
 * @param {boolean} [payload.ai_tag] - request AI auto-tagging
 */
export function saveBookmark(payload) {
  return apiFetch('/api/ext/bookmarks', { method: 'POST', body: payload })
}

/**
 * POST /api/ext/notes — create a Glassy note from selected text.
 * @param {object} payload
 * @param {string} payload.content   - markdown content (will include source citation)
 * @param {string} [payload.title]
 * @param {string[]} [payload.tags]
 * @param {'markdown'} [payload.content_format]
 */
export function saveNote(payload) {
  return apiFetch('/api/ext/notes', { method: 'POST', body: payload })
}

/**
 * POST /api/ext/ai/summarize — AI-summarize page text.
 * @param {object} payload
 * @param {string} payload.text - page body text (max 5000 chars)
 * @param {string} [payload.url]
 */
export function summarizePage(payload) {
  return apiFetch('/api/ext/ai/summarize', { method: 'POST', body: payload })
}

/**
 * GET /api/keep/bookmarks?q=... — quick search bookmarks from extension popup.
 * @param {string} q - search query
 * @param {number} [limit] - max results (default 10)
 */
export function searchBookmarks(q, limit = 10) {
  const params = new URLSearchParams({ q, limit: String(limit) })
  return apiFetch(`/api/keep/bookmarks?${params}`)
}

/**
 * PATCH /api/ext/bookmarks/:id — update a bookmark.
 * @param {number} id - bookmark ID
 * @param {object} updates - fields to update (title, description, tags, is_archived, is_starred, mark_read, notes)
 */
export function updateBookmark(id, updates) {
  return apiFetch(`/api/ext/bookmarks/${encodeURIComponent(id)}`, { method: 'PATCH', body: updates })
}

/**
 * DELETE /api/ext/bookmarks/:id — delete a bookmark.
 * @param {number} id - bookmark ID
 */
export function deleteBookmark(id) {
  return apiFetch(`/api/ext/bookmarks/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/**
 * GET /api/ext/bookmarks/:id/highlights — list highlights for a bookmark.
 * @param {number} id - bookmark ID
 */
export function fetchHighlights(id) {
  return apiFetch(`/api/ext/bookmarks/${encodeURIComponent(id)}/highlights`)
}

/**
 * POST /api/ext/bookmarks/:id/highlights — create a highlight.
 * @param {number} id - bookmark ID
 * @param {object} payload - { text, note?, color }
 */
export function createHighlight(id, payload) {
  return apiFetch(`/api/ext/bookmarks/${encodeURIComponent(id)}/highlights`, { method: 'POST', body: payload })
}

/**
 * DELETE /api/ext/highlights/:id — delete a highlight.
 * @param {number} id - highlight ID
 */
export function deleteHighlight(id) {
  return apiFetch(`/api/ext/highlights/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/**
 * GET /api/ext/tags — list all tags for autocomplete.
 */
export function fetchTags() {
  return apiFetch('/api/ext/tags')
}

/**
 * POST /api/ext/collections — create a new collection.
 */
export function createCollection(name) {
  return apiFetch('/api/ext/collections', {
    method: 'POST',
    body: { name },
  })
}
