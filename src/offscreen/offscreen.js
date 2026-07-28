/**
 * Glassy Companion — Offscreen Document (MV3 Workaround)
 *
 * Chrome MV3 kills service workers after ~30s of inactivity. Heavy save
 * operations (content script extraction, Markdown formatting, API calls)
 * can exceed this window under load.
 *
 * The offscreen document is a persistent hidden page that never gets killed.
 * The service worker delegates capture processing here and receives results
 * back. The service worker itself only does message passing — staying well
 * within the 30s window.
 *
 * Additionally, the Obsidian Bridge SSE connection lives here. The SSE
 * EventSource cannot survive service worker eviction, but the offscreen doc
 * is never evicted — so the bridge stays alive indefinitely while the
 * browser is open. This is the fix for the "extension says connected, server
 * says not connected" bug on WSL2/Docker self-host.
 *
 * Communication: chrome.runtime.onMessage between offscreen.js and
 * service-worker.js. The offscreen doc uses the same chrome.* APIs as the
 * service worker but with the full DOM environment available.
 */

import { saveCapture, saveBookmark, saveDocument, saveNote } from '../lib/api.js'
import { enqueue } from '../lib/offlineQueue.js'
import { getToken, peekToken } from '../lib/auth.js'
import { planBackgroundSaveFailure, planQueueFailure } from '../background/savePolicy.js'
import { buildCaptureItem } from '../lib/capturePipeline.js'
import { obsidianFetch } from '../lib/obsidianFetch.js'

// ── Obsidian Bridge state (owned by the offscreen doc) ────────────────────────
// The SSE connection lives HERE, not in the service worker. The offscreen doc
// is persistent and never evicted by Chrome MV3.
let bridgeSseConnection = null
let bridgeIntentionallyDisconnected = false
let bridgeReconnectTimer = null
let bridgeReconnectDelay = 5000
const BRIDGE_MAX_RECONNECT_DELAY = 30000
const BRIDGE_SETTINGS_KEY = 'glassy_obsidian_bridge_settings'
const BRIDGE_STATUS_KEY = 'glassy_obsidian_bridge_status'

// ── Keep-alive heartbeat ──────────────────────────────────────────────────────
// Chrome MV3 kills offscreen documents that appear idle (~3 seconds of no
// activity). A periodic message to the service worker keeps the messaging
// channel active and prevents eviction. Without this, the SSE connection
// opens successfully but Chrome kills the offscreen doc almost immediately,
// and the 2-minute alarm is too slow to catch 3-second drops.
let heartbeatInterval = null
const HEARTBEAT_INTERVAL_MS = 15000

function startHeartbeat() {
  if (heartbeatInterval) return
  heartbeatInterval = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'OFFSCREEN_HEARTBEAT' }).catch(() => {
      // SW may be suspended — that's fine, the sendMessage itself keeps
      // the offscreen doc's messaging channel alive from Chrome's perspective.
    })
  }, HEARTBEAT_INTERVAL_MS)
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }
}

async function getBridgeSettings() {
  const result = await chrome.storage.local.get(BRIDGE_SETTINGS_KEY)
  const stored = result[BRIDGE_SETTINGS_KEY] || {}
  return { enabled: false, url: 'https://127.0.0.1:27124', token: '', ...stored }
}

async function getBridgeStatus() {
  const result = await chrome.storage.local.get(BRIDGE_STATUS_KEY)
  return result[BRIDGE_STATUS_KEY] || { connected: false, error: null, lastConnected: null }
}

async function updateBridgeStatus(partial) {
  const current = await getBridgeStatus()
  const updated = { ...current, ...partial }
  await chrome.storage.local.set({ [BRIDGE_STATUS_KEY]: updated })
}

async function getBaseUrl() {
  const result = await chrome.storage.local.get('glassy_base_url')
  return result.glassy_base_url || 'https://app.glassy.fyi'
}

/**
 * Start the SSE bridge connection in the offscreen document.
 */
async function startBridgeSSE() {
  const settings = await getBridgeSettings()
  if (!settings.enabled || !settings.url || !settings.token) {
    return { ok: false, error: 'Bridge not configured' }
  }

  bridgeIntentionallyDisconnected = false
  startHeartbeat()
  await connectBridgeSSE()
  return { ok: true }
}

/**
 * Stop the SSE bridge connection in the offscreen document.
 */
async function stopBridgeSSE() {
  bridgeIntentionallyDisconnected = true
  stopHeartbeat()
  if (bridgeReconnectTimer) {
    clearTimeout(bridgeReconnectTimer)
    bridgeReconnectTimer = null
  }
  if (bridgeSseConnection) {
    try { bridgeSseConnection.close() } catch { /* no-op */ }
    bridgeSseConnection = null
  }
  await updateBridgeStatus({ connected: false, error: null })
  return { ok: true }
}

/**
 * Open the SSE connection to the Glassy server and listen for proxy requests.
 *
 * Uses peekToken() (non-destructive) instead of getToken() because the offscreen
 * document has no UI to re-authenticate. If the JWT expired, getToken() would
 * call clearAuth() and silently nuke the token — the user would get no feedback
 * and the bridge would die silently. peekToken() returns null on expiry WITHOUT
 * clearing auth, and we report the expiry to the service worker so it can show
 * a notification prompting the user to log in again.
 *
 * Auth: uses a one-time SSE ticket (POST /ticket → GET /subscribe?ticket=)
 * instead of passing the JWT in the URL. The JWT never appears in server logs,
 * proxy logs, or browser history. The ticket is short-lived (60s) and one-use.
 */
async function connectBridgeSSE() {
  if (bridgeSseConnection || bridgeIntentionallyDisconnected) return

  const baseUrl = await getBaseUrl()
  const token = await peekToken()

  if (!token) {
    await updateBridgeStatus({ connected: false, error: 'Not authenticated with Glassy — open the extension popup to log in' })
    // Notify the service worker so it can show a desktop notification.
    // The user must re-authenticate via the popup (the offscreen doc can't).
    try {
      await chrome.runtime.sendMessage({ type: 'BRIDGE_AUTH_EXPIRED' })
    } catch { /* SW may be suspended — the status update is the durable signal */ }
    return
  }

  // Exchange the JWT for a one-time SSE ticket so the JWT doesn't leak in the URL.
  // Falls back to ?token= if the ticket endpoint is unavailable (older servers).
  let sseUrl = `${baseUrl.replace(/\/$/, '')}/api/ext/obsidian-bridge/subscribe`
  let usedTicket = false
  try {
    const ticketResponse = await fetch(`${baseUrl.replace(/\/$/, '')}/api/ext/obsidian-bridge/ticket`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (ticketResponse.ok) {
      const { ticket } = await ticketResponse.json()
      if (ticket) {
        sseUrl += `?ticket=${encodeURIComponent(ticket)}`
        usedTicket = true
      }
    }
  } catch {
    // Ticket endpoint unavailable (older server) — fall back to ?token=
  }
  if (!usedTicket) {
    sseUrl += `?token=${encodeURIComponent(token)}`
  }

  const url = sseUrl

  try {
    bridgeSseConnection = new EventSource(url)

    bridgeSseConnection.onopen = () => {
      bridgeReconnectDelay = 5000
      updateBridgeStatus({ connected: true, error: null, lastConnected: new Date().toISOString() })
      // Push our Obsidian URL to the server so the web-app UI stays in sync.
      // The token stays extension-side only (never sent to the server).
      syncSettingsToServer(baseUrl, token).catch(() => {})
    }

    bridgeSseConnection.onerror = () => {
      if (bridgeSseConnection) {
        try { bridgeSseConnection.close() } catch { /* no-op */ }
        bridgeSseConnection = null
      }
      updateBridgeStatus({ connected: false, error: 'SSE disconnected, reconnecting…' })
      scheduleBridgeReconnect()
    }

    bridgeSseConnection.addEventListener('obsidian-request', (event) => {
      handleBridgeProxyRequest(event.data, baseUrl, token)
    })

    bridgeSseConnection.addEventListener('ping', () => {
      // Keep-alive ping from server; no action needed
    })
  } catch (err) {
    await updateBridgeStatus({ connected: false, error: err.message })
    scheduleBridgeReconnect()
  }
}

function scheduleBridgeReconnect() {
  if (bridgeIntentionallyDisconnected) return
  if (bridgeReconnectTimer) clearTimeout(bridgeReconnectTimer)
  bridgeReconnectTimer = setTimeout(() => {
    bridgeReconnectTimer = null
    connectBridgeSSE()
  }, bridgeReconnectDelay)
  bridgeReconnectDelay = Math.min(bridgeReconnectDelay * 1.5, BRIDGE_MAX_RECONNECT_DELAY)
}

/**
 * Handle a proxy request from the server — call Obsidian and POST the result back.
 * @param {string} rawData - JSON string: {requestId, method, path, body}
 * @param {string} baseUrl
 * @param {string} token
 */
async function handleBridgeProxyRequest(rawData, baseUrl, token) {
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
 * Push the extension's Obsidian URL to the server so the web-app UI stays
 * in sync. The token stays extension-side only — the server doesn't need it
 * for bridge-routed requests (the extension holds it and calls Obsidian directly).
 * @param {string} baseUrl
 * @param {string} token - Glassy JWT
 */
async function syncSettingsToServer(baseUrl, token) {
  const settings = await getBridgeSettings()
  if (!settings.url) return
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/api/ext/obsidian-bridge/settings`
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ obsidianUrl: settings.url }),
    })
  } catch (err) {
    console.warn('[Obsidian Bridge] Failed to sync settings to server:', err.message)
  }
}

/**
 * Test the full bridge loop: server→extension→Obsidian.
 * Reports both the SSE bridge status AND the direct Obsidian fetch result.
 * @param {string} url
 * @param {string} token
 * @returns {Promise<{ok: boolean, status: number, plugin: Object|null, error: string|null, bridgeConnected: boolean}>}
 */
async function testBridgeConnection(url, token) {
  const status = await getBridgeStatus()
  const bridgeConnected = !!status.connected

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
          version: info.version || info.apiVersion || null,
          service: info.service || 'Obsidian Local REST API',
          authenticated: info.authenticated !== false,
        }
      } catch { /* no-op */ }
      return { ok: true, status: result.status, plugin, error: null, bridgeConnected }
    }
    return { ok: false, status: result.status, plugin: null, error: `HTTP ${result.status}`, bridgeConnected }
  } catch (err) {
    return { ok: false, status: 0, plugin: null, error: err.message, bridgeConnected }
  }
}

// ── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleOffscreenMessage(message)
    .then(sendResponse)
    .catch(err => sendResponse({ ok: false, error: err.message }))
  return true // async
})

async function handleOffscreenMessage(message) {
  switch (message.type) {
    case 'OFFSCREEN_PROCESS_CAPTURE':
      return processCapture(message.payload)
    case 'OFFSCREEN_FLUSH_QUEUE_ITEM':
      return flushQueueItem(message.item)
    case 'OFFSCREEN_PING':
      return { ok: true }

    // ── Obsidian Bridge messages (owned by offscreen doc) ───────────────
    case 'OFFSCREEN_BRIDGE_START':
      return startBridgeSSE()
    case 'OFFSCREEN_BRIDGE_STOP':
      return stopBridgeSSE()
    case 'OFFSCREEN_BRIDGE_TEST':
      return testBridgeConnection(message.payload?.url, message.payload?.token)
    case 'OFFSCREEN_BRIDGE_STATUS':
      return { ok: true, status: await getBridgeStatus() }

    case 'OFFSCREEN_CROP_IMAGE': {
      try {
        const { dataUrl, rect, dpr = 1 } = message
        const img = new Image()
        img.src = dataUrl
        await new Promise((resolve, reject) => {
          img.onload = resolve
          img.onerror = () => reject(new Error('Failed to load image for crop'))
          // Safety timeout
          setTimeout(() => reject(new Error('Image load timeout')), 5000)
        })
        // captureVisibleTab produces an image scaled by devicePixelRatio relative
        // to the CSS-pixel coordinates the content script measured. Scale the rect
        // to device pixels and clamp to the captured image bounds.
        const scale = dpr || 1
        const sx = Math.max(0, Math.round(rect.x * scale))
        const sy = Math.max(0, Math.round(rect.y * scale))
        const sw = Math.max(1, Math.min(Math.round(rect.width * scale), img.naturalWidth - sx))
        const sh = Math.max(1, Math.min(Math.round(rect.height * scale), img.naturalHeight - sy))

        const canvas = document.createElement('canvas')
        canvas.width = sw
        canvas.height = sh
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
        const croppedDataUrl = canvas.toDataURL('image/png')
        return { dataUrl: croppedDataUrl, width: sw, height: sh }
      } catch (err) {
        return { error: err.message }
      }
    }

    default:
      return { ok: false, error: 'Unknown offscreen message type' }
  }
}

// ── Capture processing ───────────────────────────────────────────────────────

/**
 * Process a capture end-to-end:
 * 1. Extract content from active tab (if needed)
 * 2. Assemble premium Markdown
 * 3. Call API (or queue if offline)
 * 4. Return result to service worker
 */
async function processCapture(payload) {
  const token = await getToken()
  if (!token) return { ok: false, error: 'Not logged in' }

  const { tabId, tabUrl, item } = payload

  const captureItem = await buildCaptureItem({ item, tabId, tabUrl })

  // Step 4: Save (online) or queue (offline)
  if (!navigator.onLine) {
    try {
      const queued = await enqueue('capture', captureItem)
      return { ok: true, queued: true, itemId: queued.id }
    } catch (err) {
      return { ok: false, error: err.message, code: err.code }
    }
  }

  try {
    const result = await saveCapture(captureItem)
    return { ok: true, data: result, duplicate: !!result?.duplicate }
  } catch (err) {
    const plan = planBackgroundSaveFailure(err)
    if (plan.queue) {
      try {
        const queued = await enqueue('capture', captureItem)
        return { ok: true, queued: true, itemId: queued.id, reason: plan.kind }
      } catch (queueErr) {
        return { ok: false, error: queueErr.message, code: queueErr.code }
      }
    }
    return { ok: false, error: err.message, status: err.status, kind: plan.kind, body: err.body }
  }
}

// ── Queue flush ────────────────────────────────────────────────────────────

/**
 * Flush a single queue item: perform the network save and report the outcome.
 *
 * This is PURE with respect to the queue — it does NOT dequeue/increment here.
 * The service worker is the single owner of queue mutation and applies all
 * outcomes in one batched write after the flush loop (see applyFlushOutcomes).
 * Returns { synced } / { retry } / { dropped } for the caller to act on.
 */
async function flushQueueItem(item) {
  const token = await getToken()
  if (!token) return { ok: false, error: 'Not authenticated' }

  if (item.attempts >= 5) {
    return { ok: true, dropped: true, reason: 'max_attempts' }
  }

  try {
    if (item.type === 'capture') await saveCapture(item.payload)
    else if (item.type === 'bookmark') await saveBookmark(item.payload)
    else if (item.type === 'page' || item.type === 'document') await saveDocument(item.payload)
    else await saveNote(item.payload)

    return { ok: true, synced: true }
  } catch (err) {
    const plan = planQueueFailure(err)
    if (plan.action === 'retry') {
      return { ok: false, retry: true }
    }
    // action === 'drop' or 'pause' — caller drops the item from the queue
    return { ok: false, dropped: true, reason: plan.kind }
  }
}
