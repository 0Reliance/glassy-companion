/**
 * Glassy API client — authenticated fetch wrapper for extension API routes.
 * Reads the token from chrome.storage.local on each call (auth.js owns the key).
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

  // Enforce HTTPS, or allow HTTP for local/Tailscale self-hosted instances.
  const _isHttps = /^https:\/\//i.test(baseUrl)
  const _isSafeHttp = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(baseUrl) ||
    /^http:\/\/(10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?\/?.*/i.test(baseUrl) ||
    /^http:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.ts\.net(:\d+)?$/i.test(baseUrl)
  if (!_isHttps && !_isSafeHttp) {
    throw new ApiError(0, 'Server URL must use HTTPS, or be a local/Tailscale address (http://localhost, LAN IP, or *.ts.net).')
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
    // Size guard. Fast path: pure-ASCII char count equals byte count. For
    // multi-byte content, char count UNDERCOUNTS bytes — measure the real
    // UTF-8 size so the cap means what it says.
    const byteSize = /^[\u0000-\u007F]*$/.test(text)
      ? text.length
      : new TextEncoder().encode(text).byteLength
    if (byteSize > MAX_RESPONSE_BYTES) {
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
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(`${baseUrl}${API_PATHS.ping}`, { signal: controller.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
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
 * POST /api/ext/capture-image — upload a screenshot from extension.
 * Accepts base64 dataUrl, returns { url, absoluteUrl, id, format, success }.
 *
 * The server returns a host-relative path (e.g. /uploads/captures/x.webp).
 * We resolve it against the *configured* base URL here so the embedded image
 * always points at the instance the user is actually authenticated against
 * (glassy.fyi, a self-hosted server, or a dev instance) — never a hardcoded host.
 *
 * @param {string} dataUrl - base64 data URL of the screenshot
 */
export async function uploadCaptureImage(dataUrl) {
  const result = await apiFetch(API_PATHS.captureImage, { method: 'POST', body: { dataUrl } })
  if (result?.url && !/^https?:\/\//i.test(result.url)) {
    const baseUrl = await getBaseUrl()
    const path = result.url.startsWith('/') ? result.url : `/${result.url}`
    result.absoluteUrl = `${baseUrl.replace(/\/+$/, '')}${path}`
  } else if (result?.url) {
    result.absoluteUrl = result.url
  }
  return result
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

// ── Knowledge Base (Second Brain) ──────────────────────────────────────────────

/**
 * POST /api/kb/query — Search the knowledge base using hybrid text + semantic search.
 * @param {string} query - Natural language search query
 * @param {Object} options - Search options
 * @param {string[]} options.sources - Source types to search (bookmarks, notes, vault, voice)
 * @param {number} options.limit - Max results (default 10)
 */
export function searchKnowledgeBase(query, options = {}) {
  return apiFetch(API_PATHS.kbSearch, {
    method: 'POST',
    body: {
      query,
      sources: options.sources,
      limit: options.limit || 10,
    },
  })
}

/**
 * GET /api/kb/status — Get corpus indexing status.
 */
export function getKbStatus() {
  return apiFetch(API_PATHS.kbStatus)
}

/**
 * POST /api/ext/mcp-token — Exchange JWT for MCP connection info.
 * Returns { mcpUrl, mcpToken } for configuring external AI tools.
 */
export function getMcpToken() {
  return apiFetch(API_PATHS.kbMcpToken, { method: 'POST' })
}

// ── Obsidian Vault (Phase A: Vault Browser) ───────────────────────────────────
// All endpoints are server-side and route through the bridge when the user is
// on self-host/WSL2. The extension never talks to the Obsidian Local REST API
// directly for vault browsing — the server proxies via the bridge SSE.
// These return the JSON body from apiFetch (which already parsed it).

/**
 * GET /api/obsidian/vault[/:path] — List a vault directory.
 * @param {string} [path] - vault-relative path ('' for root)
 * @returns {Promise<{type:'directory', path:string, files:string[]}|{type:'file', path:string, content:string}>}
 *   files is an array of strings; folders end with '/'.
 */
export function listVault(path = '') {
  const p = path ? `/${encodeURIComponent(path)}` : ''
  return apiFetch(`${API_PATHS.obsidianVault}${p}`)
}

/**
 * GET /api/obsidian/vault-file/*path?meta=true — Read a file + metadata.
 * @param {string} filePath - vault-relative file path
 * @param {boolean} [withMeta] - include links/backlinks/tags/frontmatter
 * @returns {Promise<{path:string, content:string, meta:?{links:[],backlinks:[],tags:[],frontmatter:{}}}>}
 */
export function readVaultFile(filePath, withMeta = true) {
  const params = withMeta ? '?meta=true' : ''
  return apiFetch(`${API_PATHS.obsidianVaultFile}/${encodeURIComponent(filePath)}${params}`)
}

/**
 * GET /api/obsidian/render/*path — Rendered HTML for a vault file.
 * @param {string} filePath - vault-relative file path
 * @returns {Promise<{path:string, html:string, raw:string}>}
 */
export function renderVaultFile(filePath) {
  return apiFetch(`${API_PATHS.obsidianRender}/${encodeURIComponent(filePath)}`)
}

/**
 * POST /api/obsidian/open — Open a file in the Obsidian desktop app.
 * @param {string} filePath - vault-relative file path
 * @returns {Promise<{ok:boolean, message:string}>}
 */
export function openInObsidian(filePath) {
  return apiFetch(API_PATHS.obsidianOpen, { method: 'POST', body: { path: filePath } })
}

/**
 * GET /api/obsidian/status — Bridge + plugin connection status.
 * @returns {Promise<{connected:boolean, authenticated:boolean, status:string, pluginVersion:?string, pluginWarning:?*>}>}
 */
export function getObsidianStatus() {
  return apiFetch(API_PATHS.obsidianStatus)
}

// ── Phase B: Quick Note + Daily Note ─────────────────────────────────────────

/**
 * GET /api/obsidian/daily — Fetch today's daily note content.
 * @returns {Promise<{content:?string, date:string, exists?:boolean}>}
 *   content is null when no daily note exists yet (404 from the plugin).
 */
export function getDailyNote() {
  return apiFetch(API_PATHS.obsidianDaily)
}

/**
 * POST /api/obsidian/daily/append — Append text to today's daily note.
 * @param {string} content - markdown text to append
 * @returns {Promise<{ok:boolean, message:string}>}
 */
export function appendDailyNote(content) {
  return apiFetch(API_PATHS.obsidianDailyAppend, {
    method: 'POST',
    body: { content },
  })
}

/**
 * POST /api/obsidian/push — Push a Glassy note to the vault as a .md file.
 * @param {string} noteId - the Glassy note id returned by saveNote()
 * @returns {Promise<{ok:boolean, message:string, filename:string}>}
 */
export function pushNoteToVault(noteId) {
  return apiFetch(API_PATHS.obsidianPush, { method: 'POST', body: { noteId } })
}

// ── Phase C/D: Vault search + tags ────────────────────────────────────────────

/**
 * GET /api/obsidian/search?q= — Search vault contents.
 * @param {string} query - search query
 * @returns {Promise<Array<{filename:string, matches:Array, score:number}>>}
 *   Passes through the Obsidian Local REST API search/simple response.
 */
export function searchVault(query) {
  return apiFetch(`${API_PATHS.obsidianSearch}?q=${encodeURIComponent(query)}`)
}

/**
 * GET /api/obsidian/tags — List all tags in the vault.
 * @returns {Promise<Array<{tag:string, count:number}>|{tags:Array}>}
 *   Passes through the Obsidian Local REST API /tags response, which is a
 *   BARE ARRAY of {tag, count} objects (not {tags:[...]}). Tags use the
 *   `.tag` key (not `.name` like Glassy tags). Consumers should handle both
 *   shapes via Array.isArray(result) || result?.tags.
 */
export function getVaultTags() {
  return apiFetch(API_PATHS.obsidianTags)
}
