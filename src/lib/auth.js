/**
 * Auth helpers — JWT management via chrome.storage.session (cleared on browser close)
 * and user profile cache via chrome.storage.local (persisted).
 */
import { STORAGE_KEYS, DEFAULT_BASE_URL, API_PATHS } from './constants.js'

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
  const result = await chrome.storage.session.get(STORAGE_KEYS.token)
  const token = result[STORAGE_KEYS.token] || null
  if (token && isTokenExpired(token)) {
    await clearAuth()
    return null
  }
  return token
}

/** Persist the JWT token in session storage (cleared on browser close). */
export async function setToken(token) {
  await chrome.storage.session.set({ [STORAGE_KEYS.token]: token })
}

/** Clear auth state — both token and cached user. */
export async function clearAuth() {
  await chrome.storage.session.remove(STORAGE_KEYS.token)
  await chrome.storage.local.remove(STORAGE_KEYS.user)
  await chrome.storage.local.remove(STORAGE_KEYS.activeAccountId)
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

/** Set a custom base URL (for self-hosted Glassy instances). */
export async function setBaseUrl(url) {
  const clean = url.replace(/\/$/, '')
  // Only accept HTTPS or localhost for security
  if (!/^https:\/\//i.test(clean) && !/^http:\/\/localhost(:\d+)?$/i.test(clean)) {
    throw new Error('Server URL must use HTTPS.')
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
  try {
    const baseUrl = await getBaseUrl()
    const res = await fetch(`${baseUrl}${API_PATHS.login}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.error || 'Login failed' }

    await setToken(data.token)
    await setCachedUser(data.user)
    return { ok: true, user: data.user, token: data.token }
  } catch {
    return { ok: false, error: 'Network error. Check your connection.' }
  }
}

/**
 * Verify the stored token is still valid by calling /api/ext/me.
 * Returns { ok: true, user } or { ok: false }.
 */
export async function verifyToken() {
  const token = await getToken()
  if (!token) return { ok: false }

  try {
    const baseUrl = await getBaseUrl()
    const activeAccountId = await getActiveAccountId()
    const headers = { Authorization: `Bearer ${token}` }
    if (activeAccountId) headers['X-Account-Id'] = activeAccountId
    const res = await fetch(`${baseUrl}${API_PATHS.me}`, { headers })
    if (!res.ok) {
      await clearAuth()
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
  }
}
