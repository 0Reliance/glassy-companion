/**
 * Auth helpers — JWT + active-account state in chrome.storage.local so the
 * session survives browser restarts (matches user expectation: "stay signed in").
 * The JWT's own `exp` claim is enforced by `getToken()` so a stale token is
 * still rejected, and `clearAuth()` wipes everything on explicit logout.
 *
 * User profile cache also lives in chrome.storage.local.
 */
import { STORAGE_KEYS, DEFAULT_BASE_URL, API_PATHS } from './constants.js'

// Cap interactive auth requests (login, verify) so an unreachable/hanging
// server can't leave the popup spinner spinning forever. apiFetch enforces
// its own 30s cap; these raw fetches previously had none.
const AUTH_REQUEST_TIMEOUT_MS = 15_000

/**
 * Decode JWT payload (base64url → JSON). Returns null if malformed.
 * @param {string} token
 */
function decodeJwtPayload(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    // base64url → base64 → decode
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch {
    return null
  }
}

/**
 * Returns true if the JWT exp claim is in the past.
 * Treats tokens with no exp as valid.
 */
function isTokenExpired(token) {
  const payload = decodeJwtPayload(token)
  if (!payload?.exp) return false
  return Date.now() / 1000 >= payload.exp
}

/** Retrieve the stored JWT token, or null if not logged in or expired. */
export async function getToken() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.token)
  let token = result[STORAGE_KEYS.token] || null
  if (!token) {
    // Migration: legacy builds (≤ v2.2.x) stored the token in session storage,
    // which Chrome clears on browser restart. Promote it to local once so users
    // who upgrade aren't logged out, then drop the session copy.
    try {
      const legacy = await chrome.storage.session.get(STORAGE_KEYS.token)
      const legacyToken = legacy?.[STORAGE_KEYS.token]
      if (legacyToken) {
        await chrome.storage.local.set({ [STORAGE_KEYS.token]: legacyToken })
        await chrome.storage.session.remove(STORAGE_KEYS.token)
        token = legacyToken
      }
    } catch {
      // Session storage may be unavailable in some contexts (tests); ignore.
    }
  }
  if (token && isTokenExpired(token)) {
    await clearAuth()
    return null
  }
  return token
}

/** Persist the JWT token in local storage so it survives browser restarts. */
export async function setToken(token) {
  await chrome.storage.local.set({ [STORAGE_KEYS.token]: token })
}

/**
 * Peek at the stored JWT token WITHOUT clearing it on expiry.
 *
 * `getToken()` calls `clearAuth()` when the JWT is expired, which is correct
 * for interactive contexts (popup, save flows) — the user will be prompted to
 * log in again. But the offscreen document holds the Obsidian Bridge SSE
 * connection and has no UI to re-authenticate. If it calls `getToken()` and the
 * JWT expired, `clearAuth()` would nuke the token and the offscreen doc would
 * silently fail with "Not authenticated" — the user gets no feedback.
 *
 * This non-destructive variant returns the token (or null if expired) WITHOUT
 * clearing auth. Callers that detect expiry should report it via a message to
 * the service worker (which can show a notification) rather than clearing auth
 * silently from a headless context.
 *
 * @returns {Promise<string|null>} The stored JWT, or null if absent/expired.
 */
export async function peekToken() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.token)
  let token = result[STORAGE_KEYS.token] || null
  if (!token) {
    // Same legacy migration as getToken(), but non-destructive.
    try {
      const legacy = await chrome.storage.session.get(STORAGE_KEYS.token)
      const legacyToken = legacy?.[STORAGE_KEYS.token]
      if (legacyToken) {
        await chrome.storage.local.set({ [STORAGE_KEYS.token]: legacyToken })
        await chrome.storage.session.remove(STORAGE_KEYS.token)
        token = legacyToken
      }
    } catch { /* session storage unavailable */ }
  }
  if (token && isTokenExpired(token)) {
    return null // expired — do NOT clearAuth() from a headless context
  }
  return token
}

/** Clear auth state — token, cached user, and active account selection. */
export async function clearAuth() {
  await chrome.storage.local.remove(STORAGE_KEYS.token)
  await chrome.storage.local.remove(STORAGE_KEYS.activeAccountId)
  await chrome.storage.local.remove(STORAGE_KEYS.user)
  // Belt-and-braces: also drop any legacy session-scoped copies from older builds.
  try {
    await chrome.storage.session.remove(STORAGE_KEYS.token)
    await chrome.storage.session.remove(STORAGE_KEYS.activeAccountId)
  } catch {
    // Session storage may be unavailable in some contexts; ignore.
  }
}

/** Retrieve cached user profile, or null. */
export async function getCachedUser() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.user)
  return result[STORAGE_KEYS.user] || null
}

/** Cache user profile locally so popup doesn't need to re-fetch /me on every open. */
export async function setCachedUser(user) {
  await chrome.storage.local.set({ [STORAGE_KEYS.user]: user })
}

/** Retrieve the active account ID, or null (uses primary account via server fallback). */
// Stored in local storage alongside the JWT so the account selection survives
// browser restarts — matches the persisted login lifetime.
export async function getActiveAccountId() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.activeAccountId)
  return result[STORAGE_KEYS.activeAccountId] || null
}

/** Set the active account ID for multi-account support. */
export async function setActiveAccountId(accountId) {
  if (accountId) {
    await chrome.storage.local.set({ [STORAGE_KEYS.activeAccountId]: accountId })
  } else {
    await chrome.storage.local.remove(STORAGE_KEYS.activeAccountId)
  }
}

/** Get configured base URL (allows users to point at self-hosted instances). */
export async function getBaseUrl() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.baseUrl)
  return result[STORAGE_KEYS.baseUrl] || DEFAULT_BASE_URL
}

/** Batch-read baseUrl + activeAccountId in a single storage call. */
export async function getApiContext() {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.baseUrl,
    STORAGE_KEYS.activeAccountId,
  ])
  return {
    baseUrl: result[STORAGE_KEYS.baseUrl] || DEFAULT_BASE_URL,
    activeAccountId: result[STORAGE_KEYS.activeAccountId] || null,
  }
}

/** Set a custom base URL (for self-hosted Glassy instances). */
export async function setBaseUrl(url) {
  const clean = url.replace(/\/$/, '')
  // Accept HTTPS for any host, or HTTP for self-hosted local networks:
  // localhost, 127.0.0.1, [::1], private LAN (10/172.16/192.168), Tailscale (*.ts.net)
  const isHttps = /^https:\/\//i.test(clean)
  const isSafeHttp = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(clean) ||
    /^http:\/\/(10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?\/?.*/i.test(clean) ||
    /^http:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.ts\.net(:\d+)?$/i.test(clean)
  if (!isHttps && !isSafeHttp) {
    throw new Error('Server URL must use HTTPS, or be a local/Tailscale address (http://localhost, LAN IP, or *.ts.net).')
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.baseUrl]: clean })
}

/**
 * Login with email + password.
 * Returns { ok: true, user, token } or { ok: false, error }.
 */
export async function login(email, password) {
  if (!email || !/.+@.+\..+/.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS)
  try {
    const baseUrl = await getBaseUrl()
    const res = await fetch(`${baseUrl}${API_PATHS.login}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.error || 'Login failed' }

    await setToken(data.token)
    await setCachedUser(data.user)
    return { ok: true, user: data.user, token: data.token }
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { ok: false, error: 'Login timed out. Check the server URL and try again.' }
    }
    return { ok: false, error: 'Network error. Check your connection.' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Verify the stored token is still valid by calling /api/ext/me.
 * Returns { ok: true, user } or { ok: false }.
 */
export async function verifyToken() {
  const token = await getToken()
  if (!token) return { ok: false }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS)
  try {
    const baseUrl = await getBaseUrl()
    const activeAccountId = await getActiveAccountId()
    const headers = { Authorization: `Bearer ${token}` }
    if (activeAccountId) headers['X-Account-Id'] = activeAccountId
    const res = await fetch(`${baseUrl}${API_PATHS.me}`, { headers, signal: controller.signal })
    if (!res.ok) {
      // Only a REAL authentication failure (401) may end the session.
      // Transient server errors (5xx during a deploy/outage) must NOT wipe
      // the stored token — otherwise a brief backend blip logs every user
      // out of the extension (and drops their active-account context).
      if (res.status === 401) await clearAuth()
      return { ok: false }
    }
    const user = await res.json()
    await setCachedUser(user)
    // Persist the active account ID so subsequent API calls include X-Account-Id
    if (user.activeAccountId && !activeAccountId) {
      await setActiveAccountId(user.activeAccountId)
    }
    return { ok: true, user }
  } catch {
    return { ok: false }
  } finally {
    clearTimeout(timer)
  }
}
