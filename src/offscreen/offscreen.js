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
import { enqueue, dequeue, incrementAttempts } from '../lib/offlineQueue.js'
import { getToken } from '../lib/auth.js'
import { planQueueFailure } from '../background/savePolicy.js'
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
 * Flush a single queue item. Called by the service worker during alarm flush.
 */
async function flushQueueItem(item) {
  const token = await getToken()
  if (!token) return { ok: false, error: 'Not authenticated' }

  try {
    if (item.attempts >= 5) {
      await dequeue(item.id)
      return { ok: true, dropped: true, reason: 'max_attempts' }
    }

    if (item.type === 'capture') await saveCapture(item.payload)
    else if (item.type === 'bookmark') await saveBookmark(item.payload)
    else if (item.type === 'page' || item.type === 'document') await saveDocument(item.payload)
    else await saveNote(item.payload)

    await dequeue(item.id)
    return { ok: true, synced: true }
  } catch (err) {
    const plan = planQueueFailure(err)
    if (plan.action === 'retry') {
      await incrementAttempts(item.id)
      return { ok: false, retry: true }
    }
    // action === 'drop' or 'pause' — drop the item from queue
    await dequeue(item.id)
    return { ok: false, dropped: true, reason: plan.kind }
  }
}
