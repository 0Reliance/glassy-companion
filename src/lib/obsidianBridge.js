/**
 * Obsidian Bridge — the extension-side bridge that connects Glassy's server
 * to the user's local Obsidian instance. The server asks the extension to
 * proxy requests to Obsidian; the extension (running on the Windows host)
 * calls 127.0.0.1:27124 directly and returns the result.
 *
 * This solves the WSL2/Docker networking problem: the container can't reach
 * Windows localhost, but the browser extension can.
 *
 * Architecture (MV3-robust):
 *   1. Service worker calls startBridge() → delegates to the offscreen document
 *   2. Offscreen document opens an SSE connection to GET /api/ext/obsidian-bridge/subscribe
 *      (the offscreen doc is persistent — it is never evicted like the SW)
 *   3. Server pushes {requestId, method, path, body} events when it needs Obsidian
 *   4. Offscreen document calls Obsidian via obsidianFetch, then POSTs the result back
 *   5. Server resolves the pending request and returns to the AI context path
 *
 * MV3 lifecycle handling:
 *   - The SSE EventSource lives in the offscreen document, which Chrome does
 *     NOT evict. The connection stays alive indefinitely while the browser is open.
 *   - chrome.runtime.onSuspend in the service worker flips status to
 *     connected:false (belt-and-braces — the offscreen doc is the source of truth).
 *   - A 2-minute alarm in the SW re-checks the offscreen doc is alive and
 *     re-establishes it if Chrome tore it down under memory pressure.
 *   - The "Test Connection" button tests the FULL bridge loop
 *     (server→extension→Obsidian), not just extension→Obsidian.
 */

import { getSettings } from './cache.js'
import { getBaseUrl } from './auth.js'

const BRIDGE_SETTINGS_KEY = 'glassy_obsidian_bridge_settings'
const BRIDGE_STATUS_KEY = 'glassy_obsidian_bridge_status'

const DEFAULT_OBSIDIAN_URL = 'https://127.0.0.1:27124'
const SSE_RECONNECT_DELAY_MS = 5000
const MAX_RECONNECT_DELAY_MS = 30000
const BRIDGE_RECONNECT_ALARM = 'glassy_obsidian_bridge_reconnect'

// Module-level state — the SW-side view of the bridge. The actual SSE
// connection lives in the offscreen document; the SW only tracks whether
// the offscreen bridge is alive and mirrors its status.
let swBridgeStarted = false
let reconnectTimer = null
let reconnectDelay = SSE_RECONNECT_DELAY_MS
let intentionallyDisconnected = false

// We share the "offscreen ready" flag with the service worker's own
// ensureOffscreen() by always recreating if needed. This is idempotent.
let _offscreenReadyForBridge = false

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
  } else if (partial.url || partial.token) {
    // Settings changed while enabled — reconnect so the offscreen doc picks up new values
    if (updated.enabled) {
      await reconnectBridge()
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
 *
 * This tests the FULL bridge loop: server→extension→Obsidian, not just
 * extension→Obsidian. It delegates to the offscreen document which:
 *   1. Checks the SSE bridge is connected to the server
 *   2. Calls Obsidian directly via obsidianFetch
 *   3. Reports both legs of the journey
 *
 * If the SSE bridge is not connected, this still tests extension→Obsidian
 * directly so the user gets actionable feedback about which leg is broken.
 *
 * @param {string} url
 * @param {string} token
 * @returns {Promise<{ok: boolean, status: number, plugin: Object|null, error: string|null, bridgeConnected: boolean}>}
 */
export async function testObsidianConnection(url, token) {
  try {
    // Delegate to the offscreen document which owns both the SSE connection
    // and the obsidianFetch client. It tests the full loop.
    const response = await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_BRIDGE_TEST',
      payload: { url, token },
    })
    if (response?.ok) return response
    return {
      ok: false,
      status: response?.status || 0,
      plugin: null,
      error: response?.error || 'Test failed',
      bridgeConnected: response?.bridgeConnected || false,
    }
  } catch (err) {
    // Offscreen doc unreachable — fall back to a direct extension→Obsidian test
    // so the user still gets feedback. This is the legacy path.
    try {
      const { obsidianFetch } = await import('./obsidianFetch.js')
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
        return { ok: true, status: result.status, plugin, error: null, bridgeConnected: false }
      }
      return { ok: false, status: result.status, plugin: null, error: `HTTP ${result.status}`, bridgeConnected: false }
    } catch (fetchErr) {
      return { ok: false, status: 0, plugin: null, error: fetchErr.message, bridgeConnected: false }
    }
  }
}

/**
 * Start the Obsidian bridge — delegates to the offscreen document which
 * opens an SSE connection to the Glassy server and registers to receive
 * proxy requests. Called when the bridge is enabled or when the service
 * worker wakes up (on alarm).
 */
export async function startBridge() {
  const settings = await getBridgeSettings()
  if (!settings.enabled || !settings.url || !settings.token) {
    return // Not configured
  }

  intentionallyDisconnected = false
  swBridgeStarted = true
  // Create a periodic alarm (every 2 min) to verify the offscreen bridge is
  // still alive and re-establish it if Chrome tore it down under memory pressure.
  try {
    await chrome.alarms.create(BRIDGE_RECONNECT_ALARM, { periodInMinutes: 2 })
  } catch { /* no-op — alarm may already exist */ }
  await delegateToOffscreen('OFFSCREEN_BRIDGE_START')
}

/**
 * Stop the Obsidian bridge — closes the SSE connection in the offscreen doc
 * and cancels reconnect. Called when the bridge is disabled or the user logs out.
 */
export async function stopBridge() {
  intentionallyDisconnected = true
  swBridgeStarted = false
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  // Clear the reconnect alarm
  try { await chrome.alarms.clear(BRIDGE_RECONNECT_ALARM) } catch { /* no-op */ }
  await delegateToOffscreen('OFFSCREEN_BRIDGE_STOP').catch(() => {})
  await updateBridgeStatus({ connected: false, error: null })
}

/**
 * Returns true if the SW has instructed the offscreen doc to start the bridge.
 * Used by the onSuspend handler to know whether to flip status on suspend.
 */
export function isBridgeStarted() {
  return swBridgeStarted
}

/**
 * Open the SSE connection to the Glassy server and listen for proxy requests.
 * On disconnect, schedule a reconnect with exponential backoff.
 *
 * This is now a fallback used when the offscreen document is unavailable
 * (e.g. Firefox < 120 which doesn't support the offscreen API). The primary
 * path delegates to the offscreen doc.
 */
async function connectSSEInServiceWorker() {
  // Legacy fallback — only used when offscreen is unavailable
  const { obsidianFetch } = await import('./obsidianFetch.js')
  const baseUrl = await getBaseUrl()
  const { getToken } = await import('./auth.js')
  const token = await getToken()

  if (!token) {
    await updateBridgeStatus({ connected: false, error: 'Not authenticated with Glassy' })
    return
  }

  const sseUrl = `${baseUrl.replace(/\/$/, '')}/api/ext/obsidian-bridge/subscribe`
  const url = `${sseUrl}?token=${encodeURIComponent(token)}`
  // Note: EventSource in the SW is fragile (MV3 eviction) — only used as fallback
  // eslint-disable-next-line no-undef
  const sseConnection = new EventSource(url)

  sseConnection.onopen = () => {
    reconnectDelay = SSE_RECONNECT_DELAY_MS
    updateBridgeStatus({ connected: true, error: null })
  }

  sseConnection.onerror = () => {
    try { sseConnection.close() } catch { /* no-op */ }
    updateBridgeStatus({ connected: false, error: 'SSE disconnected, reconnecting…' })
    scheduleReconnect()
  }

  sseConnection.addEventListener('obsidian-request', (event) => {
    handleProxyRequestInServiceWorker(event.data, obsidianFetch, baseUrl, token)
  })

  sseConnection.addEventListener('ping', () => {
    // Keep-alive ping from server; no action needed
  })
}

/**
 * Schedule a reconnect with exponential backoff (capped at MAX_RECONNECT_DELAY_MS).
 */
function scheduleReconnect() {
  if (intentionallyDisconnected) return
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    // Try the offscreen path first; fall back to in-SW if offscreen is gone
    delegateToOffscreen('OFFSCREEN_BRIDGE_START').catch(() => connectSSEInServiceWorker())
  }, reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT_DELAY_MS)
}

/**
 * Handle a proxy request from the server (legacy in-SW path only).
 * @param {string} rawData - JSON string: {requestId, method, path, body}
 * @param {Function} obsidianFetch
 * @param {string} baseUrl
 * @param {string} token
 */
async function handleProxyRequestInServiceWorker(rawData, obsidianFetch, baseUrl, token) {
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
  let result
  try {
    const obsidianResult = await obsidianFetch(fullUrl, {
      token: settings.token,
      method: method || 'GET',
      body: body || null,
      timeoutMs: 30000,
    })
    result = { requestId, status: obsidianResult.status, body: obsidianResult.body, ok: obsidianResult.ok, error: null }
  } catch (err) {
    result = { requestId, status: 0, body: '', ok: false, error: err.message }
  }

  try {
    const resultUrl = `${baseUrl.replace(/\/$/, '')}/api/ext/obsidian-bridge/result/${requestId}`
    await fetch(resultUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(result),
    })
  } catch (err) {
    console.error('[Obsidian Bridge] Failed to post result:', err.message)
  }
}

/**
 * Delegate a message to the offscreen document. Ensures the offscreen doc
 * exists first. Returns the offscreen response, or rejects if offscreen is
 * unavailable (Firefox < 120).
 * @param {string} type - Message type (OFFSCREEN_BRIDGE_START, OFFSCREEN_BRIDGE_STOP, etc.)
 * @param {Object} [payload]
 * @returns {Promise<Object>}
 */
async function delegateToOffscreen(type, payload = {}) {
  try {
    await ensureOffscreenForBridge()
  } catch (err) {
    // Offscreen API unavailable (Firefox < 120) — fall back to in-SW SSE
    if (type === 'OFFSCREEN_BRIDGE_START') {
      return connectSSEInServiceWorker()
    }
    return { ok: false, error: 'Offscreen unavailable' }
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message })
      } else {
        resolve(response || { ok: false, error: 'No response from offscreen' })
      }
    })
  })
}

async function ensureOffscreenForBridge() {
  if (_offscreenReadyForBridge) return
  try {
    await chrome.offscreen.createDocument({
      url: 'src/offscreen/index.html',
      reasons: ['WORKERS'],
      justification: 'Hold the Obsidian Bridge SSE connection persistently (MV3 service worker evicts after ~30s)',
    })
    _offscreenReadyForBridge = true
  } catch (err) {
    if (err.message?.includes('Only one')) {
      _offscreenReadyForBridge = true
    } else {
      throw err
    }
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