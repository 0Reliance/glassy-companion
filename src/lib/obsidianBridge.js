/**
 * Obsidian Bridge — the extension-side bridge that connects Glassy's server
 * to the user's local Obsidian instance. The server asks the extension to
 * proxy requests to Obsidian; the extension (running on the Windows host)
 * calls 127.0.0.1:27124 directly and returns the result.
 *
 * This solves the WSL2/Docker networking problem: the container can't reach
 * Windows localhost, but the browser extension can.
 *
 * Architecture:
 *   1. Extension opens an SSE connection to GET /api/ext/obsidian-bridge/subscribe
 *   2. Server pushes {requestId, method, path, body} events when it needs Obsidian
 *   3. Extension calls Obsidian via obsidianFetch, then POSTs the result back
 *   4. Server resolves the pending request and returns to the AI context path
 *
 * The bridge stays alive while the SSE connection is open. MV3 service worker
 * eviction is handled by reconnecting on the next alarm tick (already used
 * for the offline sync queue).
 */

import { obsidianFetch } from './obsidianFetch.js'
import { getSettings, saveSettings } from './cache.js'
import { getBaseUrl } from './auth.js'

const BRIDGE_SETTINGS_KEY = 'glassy_obsidian_bridge_settings'
const BRIDGE_STATUS_KEY = 'glassy_obsidian_bridge_status'

const DEFAULT_OBSIDIAN_URL = 'https://127.0.0.1:27124'
const SSE_RECONNECT_DELAY_MS = 5000
const MAX_RECONNECT_DELAY_MS = 30000
const BRIDGE_RECONNECT_ALARM = 'glassy_obsidian_bridge_reconnect'

// Module-level state — the SSE connection and reconnect timer.
let sseConnection = null
let reconnectTimer = null
let reconnectDelay = SSE_RECONNECT_DELAY_MS
let intentionallyDisconnected = false

/**
 * @typedef {Object} ObsidianBridgeSettings
 * @property {boolean} enabled - Whether the bridge is turned on
 * @property {string} url - Obsidian Local REST API URL (e.g. https://127.0.0.1:27124)
 * @property {string} token - Obsidian API bearer token
 */

/**
 * Get the Obsidian bridge settings from chrome.storage.local.
 * @returns {Promise<ObsidianBridgeSettings>}
 */
export async function getBridgeSettings() {
  const result = await chrome.storage.local.get(BRIDGE_SETTINGS_KEY)
  const stored = result[BRIDGE_SETTINGS_KEY] || {}
  return {
    enabled: false,
    url: DEFAULT_OBSIDIAN_URL,
    token: '',
    ...stored,
  }
}

/**
 * Save Obsidian bridge settings to chrome.storage.local.
 * When enabling the bridge, requests the optional localhost host permissions
 * (declared in optional_host_permissions in the manifest) so the extension
 * can fetch from 127.0.0.1:27123/27124. This must be called from a user
 * gesture (button click) per Chrome's optional permissions API.
 * @param {Partial<ObsidianBridgeSettings>} partial
 */
export async function saveBridgeSettings(partial) {
  const current = await getBridgeSettings()
  const updated = { ...current, ...partial }
  await chrome.storage.local.set({ [BRIDGE_SETTINGS_KEY]: updated })
  // If enabling, request the optional localhost permissions
  if (partial.enabled && !current.enabled) {
    try {
      await chrome.permissions.request({
        origins: [
          'http://127.0.0.1:27123/',
          'https://127.0.0.1:27124/',
          'http://localhost:27123/',
          'https://localhost:27124/',
        ],
      })
    } catch (err) {
      // Permission denied — the user can still enable the bridge, but
      // fetch calls to Obsidian will fail with a CORS/permission error.
      // The test connection button will surface this clearly.
      console.warn('[Obsidian Bridge] Optional permission request failed:', err.message)
    }
  }
  // If enable/disable changed, start or stop the bridge
  if (partial.enabled !== undefined) {
    if (partial.enabled) {
      await startBridge()
    } else {
      await stopBridge()
    }
  }
}

/**
 * Get the current bridge connection status.
 * @returns {Promise<{connected: boolean, error: string|null, lastConnected: string|null}>}
 */
export async function getBridgeStatus() {
  const result = await chrome.storage.local.get(BRIDGE_STATUS_KEY)
  return result[BRIDGE_STATUS_KEY] || { connected: false, error: null, lastConnected: null }
}

/**
 * Reconnect the bridge to the current server. Called when the Glassy server
 * URL changes (e.g. user switches from cloud to self-host) — the old SSE
 * connection points at the old server and must be re-established against
 * the new one.
 */
export async function reconnectBridge() {
  const settings = await getBridgeSettings()
  if (!settings.enabled) return // Bridge is off — nothing to reconnect
  await stopBridge()
  intentionallyDisconnected = false
  await startBridge()
}

/**
 * Update the bridge connection status in storage.
 * @param {Partial<{connected: boolean, error: string|null, lastConnected: string|null}>} partial
 */
async function updateBridgeStatus(partial) {
  const current = await getBridgeStatus()
  const updated = { ...current, ...partial }
  await chrome.storage.local.set({ [BRIDGE_STATUS_KEY]: updated })
}

/**
 * Test the connection to Obsidian by calling GET / on the configured URL.
 * Used by the settings UI's "Test Connection" button.
 * @param {string} url
 * @param {string} token
 * @returns {Promise<{ok: boolean, status: number, plugin: Object|null, error: string|null}>}
 */
export async function testObsidianConnection(url, token) {
  try {
    const result = await obsidianFetch(`${url.replace(/\/$/, '')}/`, {
      token,
      method: 'GET',
      timeoutMs: 8000,
    })
    if (result.ok) {
      let plugin = null
      try {
        const info = JSON.parse(result.body)
        plugin = {
          version: parsePluginVersion(info),
          service: info.service || 'Obsidian Local REST API',
          authenticated: info.authenticated !== false,
        }
      } catch { /* no-op */ }
      return { ok: true, status: result.status, plugin, error: null }
    }
    return { ok: false, status: result.status, plugin: null, error: `HTTP ${result.status}` }
  } catch (err) {
    return { ok: false, status: 0, plugin: null, error: err.message }
  }
}

/**
 * Start the Obsidian bridge — opens an SSE connection to the Glassy server
 * and registers to receive proxy requests. Called when the bridge is enabled
 * or when the service worker wakes up (on alarm).
 */
export async function startBridge() {
  const settings = await getBridgeSettings()
  if (!settings.enabled || !settings.url || !settings.token) {
    return // Not configured
  }

  intentionallyDisconnected = false
  // Create a periodic alarm (every 2 min) to reconnect the SSE if the
  // service worker was evicted and the connection dropped.
  try {
    await chrome.alarms.create(BRIDGE_RECONNECT_ALARM, { periodInMinutes: 2 })
  } catch { /* no-op — alarm may already exist */ }
  await connectSSE()
}

/**
 * Stop the Obsidian bridge — closes the SSE connection and cancels reconnect.
 * Called when the bridge is disabled or the user logs out.
 */
export async function stopBridge() {
  intentionallyDisconnected = true
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (sseConnection) {
    try { sseConnection.close() } catch { /* no-op */ }
    sseConnection = null
  }
  // Clear the reconnect alarm
  try { await chrome.alarms.clear(BRIDGE_RECONNECT_ALARM) } catch { /* no-op */ }
  await updateBridgeStatus({ connected: false, error: null })
}

/**
 * Open the SSE connection to the Glassy server and listen for proxy requests.
 * On disconnect, schedule a reconnect with exponential backoff.
 */
async function connectSSE() {
  if (sseConnection || intentionallyDisconnected) return

  const baseUrl = await getBaseUrl()
  const { getToken } = await import('./auth.js')
  const token = await getToken()

  if (!token) {
    await updateBridgeStatus({ connected: false, error: 'Not authenticated with Glassy' })
    return
  }

  const sseUrl = `${baseUrl.replace(/\/$/, '')}/api/ext/obsidian-bridge/subscribe`

  try {
    // EventSource doesn't support custom headers, so we pass the token as a
    // query parameter. The server validates it the same way as the Authorization
    // header (JWT middleware checks both).
    const url = `${sseUrl}?token=${encodeURIComponent(token)}`
    sseConnection = new EventSource(url)

    sseConnection.onopen = () => {
      reconnectDelay = SSE_RECONNECT_DELAY_MS
      updateBridgeStatus({ connected: true, error: null })
    }

    sseConnection.onerror = () => {
      if (sseConnection) {
        try { sseConnection.close() } catch { /* no-op */ }
        sseConnection = null
      }
      updateBridgeStatus({ connected: false, error: 'SSE disconnected, reconnecting…' })
      scheduleReconnect()
    }

    sseConnection.addEventListener('obsidian-request', (event) => {
      handleProxyRequest(event.data)
    })

    sseConnection.addEventListener('ping', () => {
      // Keep-alive ping from server; no action needed
    })
  } catch (err) {
    await updateBridgeStatus({ connected: false, error: err.message })
    scheduleReconnect()
  }
}

/**
 * Schedule a reconnect with exponential backoff (capped at MAX_RECONNECT_DELAY_MS).
 */
function scheduleReconnect() {
  if (intentionallyDisconnected) return
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectSSE()
  }, reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT_DELAY_MS)
}

/**
 * Handle a proxy request from the server. Calls Obsidian via the extension
 * and POSTs the result back to the server.
 * @param {string} rawData - JSON string: {requestId, method, path, body}
 */
async function handleProxyRequest(rawData) {
  const settings = await getBridgeSettings()
  if (!settings.url || !settings.token) return

  let request
  try {
    request = JSON.parse(rawData)
  } catch {
    return // Malformed request
  }

  const { requestId, method, path, body } = request
  if (!requestId || !path) return

  const fullUrl = `${settings.url.replace(/\/$/, '')}${path}`
  const baseUrl = await getBaseUrl()
  const { getToken } = await import('./auth.js')
  const token = await getToken()

  let result
  try {
    const obsidianResult = await obsidianFetch(fullUrl, {
      token: settings.token,
      method: method || 'GET',
      body: body || null,
      timeoutMs: 30000,
    })
    result = {
      requestId,
      status: obsidianResult.status,
      body: obsidianResult.body,
      ok: obsidianResult.ok,
      error: null,
    }
  } catch (err) {
    result = {
      requestId,
      status: 0,
      body: '',
      ok: false,
      error: err.message,
    }
  }

  // POST the result back to the server
  try {
    const resultUrl = `${baseUrl.replace(/\/$/, '')}/api/ext/obsidian-bridge/result/${requestId}`
    await fetch(resultUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(result),
    })
  } catch (err) {
    console.error('[Obsidian Bridge] Failed to post result:', err.message)
  }
}

/**
 * Parse the Obsidian plugin version from the GET / response.
 * @param {Object} info
 * @returns {string|null}
 */
function parsePluginVersion(info) {
  if (!info) return null
  return info.version || info.apiVersion || null
}

/**
 * Get the extension version from the manifest.
 * @returns {string}
 */
export function getExtensionVersion() {
  try {
    return chrome.runtime.getManifest().version || 'unknown'
  } catch {
    return 'unknown'
  }
}

export {
  BRIDGE_SETTINGS_KEY,
  BRIDGE_STATUS_KEY,
  DEFAULT_OBSIDIAN_URL,
}