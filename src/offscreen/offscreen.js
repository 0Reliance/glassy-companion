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
 * Communication: chrome.runtime.onMessage between offscreen.js and
 * service-worker.js. The offscreen doc uses the same chrome.* APIs as the
 * service worker but with the full DOM environment available.
 */

import { saveCapture, saveBookmark, saveDocument, saveNote } from '../lib/api.js'
import { enqueue } from '../lib/offlineQueue.js'
import { getToken } from '../lib/auth.js'
import { planBackgroundSaveFailure, planQueueFailure } from '../background/savePolicy.js'
import { buildCaptureItem } from '../lib/capturePipeline.js'

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
