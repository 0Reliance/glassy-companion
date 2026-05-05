/**
 * Glassy API client — authenticated fetch wrapper for extension API routes.
 * Reads the token from chrome.storage.session on each call.
 */
import { getToken, getBaseUrl, getActiveAccountId, getApiContext, clearAuth } from './auth.js'
import { API_PATHS } from './constants.js'

/**
 * Core fetch wrapper. Handles auth headers, JSON encoding,
 * 401 → clear token, request timeouts, HTTPS enforcement, and 5xx retry.
 */
// Cap any single response body we'll JSON-parse. Protects the popup from a
// rogue/oversized API response ballooning extension memory.
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024

async function apiFetch(path, options = {}, _retryCount = 0) {
  // Sequence getToken() BEFORE getApiContext(): getToken() may call
  // clearAuth() on JWT expiry, which removes activeAccountId. Running them
  // in parallel could read a stale activeAccountId into the request headers.
  const token = await getToken()
  const { baseUrl, activeAccountId } = await getApiContext()

  // Enforce HTTPS — allow localhost for dev
  if (!/^https:\/\//i.test(baseUrl) && !/^http:\/\/localhost(:\d+)?$/i.test(baseUrl)) {
    throw new ApiError(0, 'Server URL must use HTTPS.')
  }

  const url = `${baseUrl}${path}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)

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
      signal: controller.signal,
    })
  } catch (networkErr) {
    clearTimeout(timer)
    if (networkErr.name === 'AbortError') {
      throw new ApiError(0, 'Request timed out.')
    }
    if (_retryCount < 1) {
      await new Promise(r => setTimeout(r, 1000))
      return apiFetch(path, options, _retryCount + 1)
    }
    throw new ApiError(0, networkErr.message || 'Network request failed')
  }
  clearTimeout(timer)

  if (res.status === 401) {
    await clearAuth()
    throw new ApiError(401, 'Session expired. Please log in again.')
  }

  if (!res.ok) {
    // Retry on 5xx once
    if (res.status >= 500 && _retryCount < 1) {
      await new Promise(r => setTimeout(r, 1000 * (_retryCount + 1)))
      return apiFetch(path, options, _retryCount + 1)
    }
    // Retry on 429 once, honoring Retry-After header (seconds or HTTP-date).
    // Cap the wait so a hostile/buggy server can't pin the popup indefinitely.
    if (res.status === 429 && _retryCount < 1) {
      const retryAfter = res.headers.get('Retry-After')
      let waitMs = 2000
      if (retryAfter) {
        const asInt = parseInt(retryAfter, 10)
        if (!Number.isNaN(asInt)) {
          waitMs = Math.min(asInt * 1000, 10_000)
        } else {
          const asDate = Date.parse(retryAfter)
          if (!Number.isNaN(asDate)) {
            waitMs = Math.min(Math.max(asDate - Date.now(), 0), 10_000)
          }
        }
      }
      await new Promise(r => setTimeout(r, waitMs))
      return apiFetch(path, options, _retryCount + 1)
    }
    let errMsg = `Request failed (${res.status})`
    let errBody = null
    try {
      errBody = await res.json()
      errMsg = errBody.error || errBody.message || errMsg
    } catch {}
    throw new ApiError(res.status, errMsg, errBody)
  }

  // 204 No Content
  if (res.status === 204) return null
  // Size-guard the response before JSON-parsing. Prefer text() so we can
  // bound the byte length; fall back to json() for callers/mocks that only
  // implement json().
  const cl = parseInt(res.headers?.get?.('content-length') || '0', 10)
  if (cl && cl > MAX_RESPONSE_BYTES) {
    throw new ApiError(413, 'Response too large.')
  }
  if (typeof res.text === 'function') {
    let text
    try {
      text = await res.text()
    } catch {
      return null
    }
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new ApiError(413, 'Response too large.')
    }
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }
  try {
    return await res.json()
  } catch {
    return null
  }
}

export class ApiError extends Error {
  constructor(status, message, body = null) {
    super(message)
    this.status = status
    this.body = body
  }
}

// ── Extension API ──────────────────────────────────────────────────────────────

/** GET /api/ext/me — fetch current user with entitlements and Keep stats. */
export function fetchMe() {
  return apiFetch(API_PATHS.me)
}

/** GET /api/ext/ping — health check (no auth required). */
export async function pingServer() {
  const baseUrl = await getBaseUrl()
  const res = await fetch(`${baseUrl}${API_PATHS.ping}`)
  return res.ok
}

/** GET /api/ext/collections — list user bookmark collections. */
export function fetchCollections() {
  return apiFetch(API_PATHS.collections)
}

/** GET /api/ext/check-url?url= — check if URL already saved. */
export function checkUrl(url) {
  return apiFetch(`${API_PATHS.checkUrl}?url=${encodeURIComponent(url)}`)
}

/**
 * POST /api/ext/bookmarks — save a bookmark.
 */
export function saveBookmark(payload) {
  return apiFetch(API_PATHS.bookmarks, { method: 'POST', body: payload })
}

/**
 * POST /api/ext/notes — create a Glassy note from selected text.
 */
export function saveNote(payload) {
  return apiFetch(API_PATHS.notes, { method: 'POST', body: payload })
}

/**
 * POST /api/ext/ai/summarize — AI-summarize page text.
 */
export function summarizePage(payload) {
  return apiFetch(API_PATHS.aiSummarize, { method: 'POST', body: payload })
}

/**
 * GET /api/keep/bookmarks?q=... — quick search bookmarks from extension popup.
 */
export function searchBookmarks(q, limit = 10) {
  const params = new URLSearchParams({ q, limit: String(limit) })
  return apiFetch(`${API_PATHS.searchBookmarks}?${params}`)
}

/**
 * PATCH /api/ext/bookmarks/:id — update a bookmark.
 */
export function updateBookmark(id, updates) {
  return apiFetch(`${API_PATHS.bookmarks}/${encodeURIComponent(id)}`, { method: 'PATCH', body: updates })
}

/**
 * DELETE /api/ext/bookmarks/:id — delete a bookmark.
 */
export function deleteBookmark(id) {
  return apiFetch(`${API_PATHS.bookmarks}/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/**
 * GET /api/ext/bookmarks/:id/highlights — list highlights for a bookmark.
 */
export function fetchHighlights(id) {
  return apiFetch(`${API_PATHS.bookmarks}/${encodeURIComponent(id)}/highlights`)
}

/**
 * POST /api/ext/bookmarks/:id/highlights — create a highlight.
 */
export function createHighlight(id, payload) {
  return apiFetch(`${API_PATHS.bookmarks}/${encodeURIComponent(id)}/highlights`, { method: 'POST', body: payload })
}

/**
 * DELETE /api/ext/highlights/:id — delete a highlight.
 */
export function deleteHighlight(id) {
  return apiFetch(`${API_PATHS.highlightsDelete.replace(':id', encodeURIComponent(id))}`, { method: 'DELETE' })
}

/**
 * GET /api/ext/tags — list all tags for autocomplete.
 */
export function fetchTags() {
  return apiFetch(API_PATHS.tags)
}

/**
 * POST /api/ext/collections — create a new collection.
 */
export function createCollection(name) {
  return apiFetch(API_PATHS.collections, {
    method: 'POST',
    body: { name },
  })
}

/**
 * POST /api/ext/documents — save a full page as a readable document.
 */
export function saveDocument(payload) {
  return apiFetch(API_PATHS.documents, { method: 'POST', body: payload })
}

// ── Next-Phase API ─────────────────────────────────────────────────────────────

/**
 * POST /api/captures — save a canonical capture item.
 * @param {import('./types.js').CaptureItem} payload
 */
export function saveCapture(payload) {
  return apiFetch(API_PATHS.captures, { method: 'POST', body: payload })
}

/**
 * GET /api/capture-rules — fetch routing and preset rules.
 */
export function fetchCaptureRules() {
  return apiFetch(API_PATHS.captureRules)
}

/**
 * PATCH /api/items/:id — update item lifecycle (status, archive, pin).
 */
export function updateItemLifecycle(id, updates) {
  return apiFetch(`${API_PATHS.items}/${encodeURIComponent(id)}`, { method: 'PATCH', body: updates })
}

/**
 * POST /api/items/:id/promote — promote an item to a public candidate.
 */
export function promoteItem(id) {
  return apiFetch(`${API_PATHS.items}/${encodeURIComponent(id)}/promote`, { method: 'POST' })
}
