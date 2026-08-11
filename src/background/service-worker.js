/**
 * Glassy Companion — Service Worker (Manifest V3)
 */

import { getToken, verifyToken, clearAuth, setActiveAccountId, getActiveAccountId, getCachedUser } from '../lib/auth.js'
import { saveBookmark, saveNote, saveDocument, searchBookmarks, checkUrl, saveCapture, createHighlight, deleteBookmark } from '../lib/api.js'
import { enqueue, getQueue, applyFlushOutcomes, clearQueue, trimQueueTo } from '../lib/offlineQueue.js'
import { getSettings, invalidateAccountScopedCaches } from '../lib/cache.js'
import { planBackgroundSaveFailure, planQueueFailure } from './savePolicy.js'
import { assemblePremiumMarkdown } from '../lib/premiumMarkdown.js'
import { getHostname } from '../lib/urlUtils.js'
import {
  CTX_SAVE_PAGE,
  CTX_SAVE_LINK,
  CTX_SAVE_SELECTION,
  CTX_SAVE_HIGHLIGHT,
  CTX_QUICK_NOTE,
  ALARM_OFFLINE_SYNC,
} from '../lib/constants.js'
import { buildCaptureItem } from '../lib/capturePipeline.js'
import { startBridge as startObsidianBridge, stopBridge as stopObsidianBridge, isBridgeStarted, recordHeartbeat, checkHeartbeat } from '../lib/obsidianBridge.js'
import { pushCaptureToVault, isPushAvailable } from '../lib/obsidianPush.js'

// ── Storage Quota Monitoring alarm name ────────────────────────────────────
// Defined here (not at the bottom of the file) so the alarm listener can
// reference it without depending on hoisting or evaluation order.
const STORAGE_QUOTA_ALARM = 'glassy_storage_quota_check'

// ── Content Script Injection Fallback ─────────────────────────────────────────

/**
 * Protocols where chrome.scripting.executeScript is forbidden. Attempting
 * injection on these throws and should be skipped entirely.
 */
const RESTRICTED_PROTOCOLS = new Set(['chrome:', 'chrome-extension:', 'about:', 'data:', 'javascript:', 'edge:', 'moz-extension:'])

/**
 * Resolve the content-script file paths to inject. These MUST come from the
 * runtime manifest, not a hardcoded source path: the Vite/CRX build rewrites
 * `src/content/extractor.js` into a hashed loader (e.g.
 * `assets/extractor.js-loader-<hash>.js`) whose name changes every build.
 * Reading the manifest keeps this correct in both dev and production.
 *
 * @returns {string[]}
 */
function getContentScriptFiles() {
  try {
    const manifest = chrome.runtime.getManifest()
    const js = manifest?.content_scripts?.[0]?.js
    if (Array.isArray(js) && js.length) return js
  } catch {}
  // Fallback to the source path (dev / unbuilt).
  return ['src/content/extractor.js']
}

/**
 * Ensure the content script is running in the given tab.
 *
 * In MV3, the static content_scripts declaration only injects on page load.
 * After an extension update (or if the tab predates installation) the content
 * script is gone — all sendMessage calls throw "Could not establish connection."
 *
 * This helper detects that situation and uses chrome.scripting.executeScript
 * to inject the content script on demand. It returns true when the content
 * script is (or is now) present, false when injection is not possible
 * (restricted page).
 *
 * The content script guards against double-registration, so a redundant
 * injection (lost race against the static loader) is harmless.
 *
 * @param {number} tabId
 * @param {string} [tabUrl]
 * @returns {Promise<boolean>}
 */
async function ensureContentScript(tabId, tabUrl) {
  if (!tabId) return false

  // Check for restricted protocol — injection will always fail on these.
  if (tabUrl) {
    try {
      const proto = new URL(tabUrl).protocol
      if (RESTRICTED_PROTOCOLS.has(proto)) return false
    } catch { return false }
  }

  // Fast-path: lightweight liveness probe (does NOT serialize the DOM).
  try {
    const pong = await chrome.tabs.sendMessage(tabId, { type: 'PING' })
    if (pong?.ok) return true // already present
  } catch {
    // Content script absent — inject it below.
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: getContentScriptFiles(),
    })
    // Brief settle time for the script to register its message listener.
    await new Promise(r => setTimeout(r, 150))
    return true
  } catch {
    // Injection failed (PDF, WebStore page, sandboxed iframe, etc.)
    return false
  }
}

// ── Offscreen Document Management (MV3 Service Worker Keep-Alive) ──────────────

let _offscreenReady = false

/**
 * Ensure the offscreen document exists. Chrome MV3 allows one offscreen doc
 * per extension. We create it on first save and keep it alive.
 *
 * Per Chrome MV3 docs, the offscreen document can be torn down by Chrome under
 * memory pressure even though our module-level flag says it's alive. We verify
 * existence with chrome.runtime.getContexts() before trusting the flag.
 * https://developer.chrome.com/docs/extensions/reference/api/offscreen
 */
async function ensureOffscreen() {
  if (_offscreenReady) {
    try {
      const existing = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
      })
      if (existing && existing.length > 0) return
      // Doc was torn down — reset the flag and recreate below
      _offscreenReady = false
    } catch {
      // getContexts unavailable (older Chrome / Firefox) — trust the flag
      return
    }
  }
  try {
    await chrome.offscreen.createDocument({
      url: 'src/offscreen/index.html',
      reasons: ['WORKERS'],
      justification: 'Process captures outside service worker to avoid the 30-second MV3 kill window',
    })
    _offscreenReady = true
  } catch (err) {
    // Already exists or unsupported (Firefox < 120)
    if (err.message?.includes('Only one')) {
      _offscreenReady = true
    } else {
      throw err
    }
  }
}

/**
 * Delegate capture processing to the offscreen document.
 * The service worker stays alive; heavy work runs in the persistent offscreen page.
 */
async function delegateCapture(payload, tab) {
  try {
    await ensureOffscreen()
  } catch {
    // Offscreen API not available — fall back to in-SW processing (legacy path)
    return processCaptureInServiceWorker(payload, tab)
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      type: 'OFFSCREEN_PROCESS_CAPTURE',
      payload: { tabId: tab?.id, tabUrl: tab?.url, item: payload }
    }, async (response) => {
      if (chrome.runtime.lastError) {
        // Offscreen doc is unreachable (Chrome may have torn it down under
        // memory pressure). Clear the cached-ready flag so the next call
        // recreates it instead of assuming it is still alive, then fall back
        // to in-SW processing for this capture.
        _offscreenReady = false
        return resolve(processCaptureInServiceWorker(payload, tab))
      }

      // After a successful offscreen save, push to Obsidian if the bridge is
      // enabled. The offscreen doc doesn't import obsidianPush, so we do it
      // here in the service worker.
      if (response?.ok && (payload.contentMarkdown || payload.excerpt || payload.title)) {
        try {
          const pushAvailable = await isPushAvailable()
          if (pushAvailable) {
            const pushResult = await pushCaptureToVault({
              title: payload.title || payload.url || 'Untitled',
              contentMarkdown: payload.contentMarkdown || payload.excerpt || '',
              tags: payload.visibleTags || [],
              sourceUrl: payload.url || payload.sourceUrl,
              capturedAt: payload.capturedAt || new Date().toISOString(),
            })
            if (pushResult.ok) {
              console.log('[Obsidian Push] Capture pushed to vault:', pushResult.path)
            } else if (pushResult.error) {
              console.warn('[Obsidian Push] Failed:', pushResult.error)
            }
          }
        } catch (pushErr) {
          console.warn('[Obsidian Push] Error:', pushErr.message)
        }
      }

      resolve(response || { ok: false, error: 'No response from offscreen' })
    })
  })
}

/** Fallback capture processing inside the service worker (Firefox / no offscreen). */
async function processCaptureInServiceWorker(payload, tab) {
  const token = await getToken()
  if (!token) return { ok: false, error: 'Not logged in' }

  const captureItem = await buildCaptureItem({
    item: payload,
    tabId: tab?.id,
    tabUrl: tab?.url,
  })

  // Save (online) or queue (offline)
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

    // Push to Obsidian if the bridge is enabled and the capture has content
    const pushAvailable = await isPushAvailable()
    if (pushAvailable && (captureItem.contentMarkdown || captureItem.excerpt)) {
      try {
        const pushResult = await pushCaptureToVault({
          title: captureItem.title,
          contentMarkdown: captureItem.contentMarkdown || captureItem.excerpt,
          tags: captureItem.visibleTags || [],
          sourceUrl: captureItem.sourceUrl,
          capturedAt: captureItem.capturedAt || new Date().toISOString(),
        })
        if (pushResult.ok) {
          console.log('[Obsidian Push] Capture pushed to vault:', pushResult.path)
        } else if (pushResult.error) {
          console.warn('[Obsidian Push] Failed:', pushResult.error)
        }
      } catch (pushErr) {
        // Push failure should never block the main save
        console.warn('[Obsidian Push] Error:', pushErr.message)
      }
    }

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

// ── Install / startup ─────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  registerContextMenus()
  ensureOfflineSyncAlarm().catch(() => {})
  // Start the Obsidian bridge if it's enabled — the service worker just woke up
  startObsidianBridge().catch(() => {})
})

chrome.runtime.onStartup.addListener(() => {
  registerContextMenus()
  ensureOfflineSyncAlarm().catch(() => {})
  // Reconnect the Obsidian bridge on browser startup
  startObsidianBridge().catch(() => {})
})

ensureOfflineSyncAlarm().catch(() => {})
// Best-effort bridge connect on SW wake
startObsidianBridge().catch(() => {})

// ── MV3 Service Worker lifecycle — keep bridge status honest ──────────────────
// When Chrome evicts the service worker, chrome.runtime.onSuspend fires. The
// actual SSE connection lives in the offscreen document (which is never evicted),
// so the bridge stays alive — we must NOT flip status to connected:false here,
// because that would make the popup show "Disconnected" even though the SSE
// bridge is actually alive in the offscreen doc (a false negative).
//
// Instead, we query the offscreen doc for its actual status. If the offscreen
// doc is unreachable (also torn down), THEN the status is genuinely unknown
// and the 2-min alarm will re-establish it on the next SW wake. We leave the
// stored status untouched on suspend — the offscreen doc is the source of
// truth and updates it via updateBridgeStatus() on connect/disconnect.
// Register the suspend listener via addListener — NOT onSuspend?.().
// chrome.runtime.onSuspend is a ChromeEvent OBJECT, not a function.
// Writing `onSuspend?.(callback)` compiles to `M.call(onSuspend, callback)`
// which throws "M.call is not a function" (Event objects have no .call method)
// → the service worker fails to register → "Status code: 15" → extension
// will not install. This was the actual root cause of the v2.13.0–v2.14.0
// install failure (introduced by commit 40e8a28).
if (chrome.runtime.onSuspend) {
  chrome.runtime.onSuspend.addListener(() => {
    if (isBridgeStarted()) {
      // Query the offscreen doc for the real bridge status. If it responds,
      // it owns the SSE and we trust its answer — do NOT overwrite it here.
      // If it doesn't respond (torn down), the next alarm tick will recreate
      // it and re-establish the SSE, updating status correctly.
      chrome.runtime.sendMessage({ type: 'OFFSCREEN_BRIDGE_STATUS' }).catch(() => {
        // Offscreen doc unreachable on suspend — leave stored status as-is.
        // The alarm will re-establish the bridge on the next SW wake.
      })
    }
  })
}

async function ensureOfflineSyncAlarm() {
  const existingAlarm = await chrome.alarms.get(ALARM_OFFLINE_SYNC)
  if (!existingAlarm) {
    await chrome.alarms.create(ALARM_OFFLINE_SYNC, { periodInMinutes: 1 })
  }
}

function registerContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CTX_SAVE_PAGE,
      title: 'Save page to Glassy',
      contexts: ['page', 'frame'],
    })

    chrome.contextMenus.create({
      id: CTX_SAVE_LINK,
      title: 'Save link to Glassy',
      contexts: ['link'],
    })

    chrome.contextMenus.create({
      id: CTX_SAVE_SELECTION,
      title: 'Save selection to Glassy',
      contexts: ['selection'],
    })

    chrome.contextMenus.create({
      id: CTX_SAVE_HIGHLIGHT,
      title: 'Highlight selection in Glassy',
      contexts: ['selection'],
    })

    chrome.contextMenus.create({
      id: CTX_QUICK_NOTE,
      title: 'New Glassy Note',
      contexts: ['page', 'frame'],
    })

    // Side panel — Chrome only (API not available in Firefox).
    if (typeof chrome.sidePanel !== 'undefined') {
      chrome.contextMenus.create({
        id: 'glassy_open_sidepanel',
        title: 'Open Glassy Side Panel',
        contexts: ['page', 'frame'],
      })
    }
  })
}

// ── Context menu handler ──────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case CTX_SAVE_PAGE:
      await backgroundSave('quick', { url: tab.url }, tab)
      break

    case CTX_SAVE_LINK:
      if (info.linkUrl) {
        await backgroundSave('quick', { url: info.linkUrl, title: info.linkText || info.linkUrl }, tab)
      }
      break

    case CTX_SAVE_SELECTION: {
      const selectedText = info.selectionText?.trim()
      if (!selectedText) break

      let markdown = selectedText
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTION_MARKDOWN' })
        if (res?.markdown) markdown = res.markdown
      } catch {}

      await backgroundSave('selection', {
        contentMarkdown: markdown,
        title: `Note from ${getHostname(tab?.url)}`,
      }, tab)
      break
    }

    case CTX_SAVE_HIGHLIGHT: {
      if (!info.selectionText?.trim()) break
      await saveHighlightFromContext(tab)
      break
    }

    case CTX_QUICK_NOTE:
      await chrome.action.openPopup?.().catch(() => {})
      await chrome.storage.session.set({ glassy_open_view: 'note' })
      break

    case 'glassy_open_sidepanel':
      if (typeof chrome.sidePanel !== 'undefined') {
        try {
          await chrome.sidePanel.open({ windowId: tab.windowId })
          await chrome.storage.session.set({ glassy_sidepanel_open: true })
        } catch {
          await chrome.action.openPopup?.().catch(() => {})
        }
      }
      break
  }
})

// ── Keyboard command handler ──────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'quick-save') {
    await backgroundSave('quick', { url: tab.url }, tab)
  }
  if (command === 'quick-note') {
    await chrome.storage.session.set({ glassy_open_view: 'note' })
    await chrome.action.openPopup?.().catch(() => {})
  }
  if (command === 'toggle-side-panel') {
    // Toggle the side panel open. There is no programmatic "close" API for
    // side panels in Chrome, so we only open it — the user closes it via the
    // browser UI. We track open state to avoid redundant opens.
    const windowId = tab?.windowId
    if (!windowId) return
    try {
      const { glassy_sidepanel_open } = await chrome.storage.session.get('glassy_sidepanel_open')
      if (!glassy_sidepanel_open) {
        await chrome.sidePanel.setOptions({ enabled: true, path: 'src/sidepanel/index.html' })
        await chrome.sidePanel.open({ windowId })
        await chrome.storage.session.set({ glassy_sidepanel_open: true })
      }
    } catch {
      // sidePanel API may not be available (Firefox, older Chrome)
      await chrome.action.openPopup?.().catch(() => {})
    }
  }
})

// ── Background save ───────────────────────────────────────────────────────────

async function backgroundSave(mode, payload, tab) {
  const token = await getToken()
  if (!token) {
    showNotification('Not logged in', 'Open the Glassy Companion popup to log in.', 'error')
    return
  }

  const sourceUrl = payload.sourceUrl || payload.url || tab?.url

  const captureItem = {
    sourceUrl,
    title: payload.title || tab?.title || 'Untitled',
    captureMode: mode,
    status: 'inbox',
    capturedAt: new Date().toISOString(),
    ...payload
  }

  // Delegate to offscreen document (or fall back to in-SW processing)
  const result = await delegateCapture(captureItem, tab)

  if (!result?.ok) {
    const err = result
    const failurePlan = planBackgroundSaveFailure(err)
    if (failurePlan.queue) {
      try {
        await enqueue('capture', captureItem)
        const queuedReason = failurePlan.kind === 'auth'
          ? 'Sign in again to sync your queued saves.'
          : 'Save will retry automatically.'
        showNotification('Glassy — Queued', queuedReason, 'info')
      } catch (queueErr) {
        const message = queueErr?.code === 'QUEUE_FULL'
          ? 'Offline queue is full — reconnect to sync.'
          : 'Could not queue this item.'
        showNotification('Glassy — Queue Full', message, 'error')
      }
      return
    }

    switch (failurePlan.kind) {
      case 'duplicate':
        showNotification('Glassy — Already saved', captureItem.title, 'info')
        break
      case 'entitlement':
        showNotification('Glassy — Save unavailable', 'Saving from the extension requires a Pro plan. Manage your items in your Glassy workspace.', 'error')
        break
      case 'gone':
        showNotification('Glassy — Account unavailable', 'This account is no longer active.', 'error')
        break
      default:
        showNotification('Glassy — Save failed', err?.message || 'Try again from the popup.', 'error')
    }
    return
  }

  if (result?.duplicate) {
    showNotification('Glassy — Already saved', captureItem.title, 'info')
  } else if (result?.queued) {
    showNotification('Glassy — Queued', 'You\'re offline or the server is busy. Save will retry.', 'info')
  } else {
    const label = await getActiveAccountLabel()
    showNotification(
      label ? `Glassy — Saved to ${label} ✓` : 'Glassy — Saved ✓',
      captureItem.title,
      'success',
    )
    if (!result?.duplicate) await updateBadge(1)
  }
}

// ── Offline queue flush ───────────────────────────────────────────────────────

let _queueFlushing = false

// Highlight context-menu helper.
//
// Highlights are a child resource of a bookmark (POST
// /api/ext/bookmarks/:id/highlights). To save a highlight from a context-menu
// click we need to ensure the page exists as a capture first, then attach the
// selected text to it. We piggy-back on saveCapture which is idempotent for
// the same canonical URL — on duplicate it returns `{ duplicate, id }` so we
// can still attach the highlight without creating a second bookmark.
async function saveHighlightFromContext(tab) {
  if (!tab?.id) return

  const token = await getToken()
  if (!token) {
    showNotification('Not logged in', 'Open the Glassy Companion popup to log in.', 'error')
    return
  }

  let highlight = null
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_HIGHLIGHT' })
    highlight = res?.highlight
  } catch {}
  if (!highlight?.text) return

  // Step 1: ensure a capture exists for this page (delegated to offscreen doc).
  let captureId = null
  const captureItem = {
    sourceUrl: tab.url,
    title: tab.title || 'Untitled',
    captureMode: 'highlight',
    status: 'inbox',
    capturedAt: new Date().toISOString(),
    contentType: 'bookmark',
  }
  const result = await delegateCapture(captureItem, tab)
  if (result?.ok) {
    captureId = result.data?.id
  } else if (result?.status === 409 && result?.body?.id) {
    captureId = result.body.id
  }

  if (!captureId) {
    showNotification('Glassy — Highlight failed', result?.error || 'Could not save the page.', 'error')
    return
  }

  try {
    await createHighlight(captureId, {
      text: highlight.text, note: '', color: 'yellow'
    })
    showNotification('Glassy — Highlighted ✓', highlight.text.slice(0, 80), 'success')
  } catch (err) {
    showNotification('Glassy — Highlight failed', err?.message || 'Could not save highlight.', 'error')
  }
}

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === STORAGE_QUOTA_ALARM) {
    // S2.8: Storage quota monitoring (6h cadence)
    await checkStorageQuota()
    return
  }
  // Obsidian bridge — every 30s: check heartbeat AND ensure SSE is alive.
  // The SW may have been evicted and restarted since the last tick, so we both
  // check the heartbeat (offscreen doc may have died) AND call startBridge
  // (which is idempotent — if the offscreen SSE is already connected, the
  // offscreen doc's connectBridgeSSE() returns early).
  if (alarm.name === 'glassy_obsidian_bridge_reconnect') {
    await checkHeartbeat().catch(() => {})
    startObsidianBridge().catch(() => {})
    return
  }
  if (alarm.name !== ALARM_OFFLINE_SYNC) return
  if (!navigator.onLine || _queueFlushing) return
  _queueFlushing = true

  try {
    const queue = await getQueue()
    if (queue.length === 0) return
    const token = await getToken()
    if (!token) return

    // Delegate queue flush to offscreen document for reliability under MV3.
    // If offscreen is unavailable, fall back to in-SW processing.
    let useOffscreen = false
    try {
      await ensureOffscreen()
      useOffscreen = true
    } catch {
      useOffscreen = false
    }

    const toRemove = new Set()
    const toIncrement = new Set()
    // 'pause' (auth failure) halts the entire flush: remaining items stay
    // queued untouched and sync after the user re-authenticates. Neither the
    // offscreen nor the legacy path may silently drop items on pause.
    let flushPaused = false

    for (const item of queue) {
      if (item.attempts >= 5) {
        toRemove.add(item.id)
        continue
      }
      try {
        if (useOffscreen) {
          const res = await chrome.runtime.sendMessage({
            type: 'OFFSCREEN_FLUSH_QUEUE_ITEM',
            item,
          })
          if (res?.paused) {
            flushPaused = true
            break // keep this item AND all following items queued
          }
          if (res?.ok && (res?.synced || res?.dropped)) {
            toRemove.add(item.id)
          } else if (res?.retry) {
            toIncrement.add(item.id)
          } else {
            toIncrement.add(item.id)
          }
        } else {
          // Legacy in-SW path
          if (item.type === 'capture') await saveCapture(item.payload)
          else if (item.type === 'bookmark') await saveBookmark(item.payload)
          else if (item.type === 'page' || item.type === 'document') await saveDocument(item.payload)
          else await saveNote(item.payload)
          toRemove.add(item.id)
        }
      } catch (err) {
        const failurePlan = planQueueFailure(err)
        if (failurePlan.action === 'pause') {
          flushPaused = true
          break // keep this item AND all following items queued
        }
        if (failurePlan.action === 'retry') toIncrement.add(item.id)
        else toRemove.add(item.id)
      }
    }
    if (flushPaused) {
      console.warn('[Glassy] Offline queue flush paused — re-authenticate to sync queued saves')
    }

    // Apply every removal/attempt-bump in a single read-modify-write instead of
    // one storage write per item (was O(n^2) across the queue). Items enqueued
    // concurrently during this flush window are preserved (see applyFlushOutcomes).
    // A rare SW kill mid-flush just replays this cycle next alarm; server-side
    // dedup makes any re-send of an already-synced item a no-op.
    await applyFlushOutcomes({ remove: toRemove, increment: toIncrement })
  } finally {
    _queueFlushing = false
  }
})

// ── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => {
    sendResponse({ ok: false, error: err.message })
  })
  return true
})

async function handleMessage(message) {
  switch (message.type) {
    // The offscreen doc detected that the Glassy JWT expired while the user
    // wasn't looking. The offscreen doc can't show UI, so it asks us (the SW)
    // to surface a desktop notification prompting the user to re-login.
    case 'BRIDGE_AUTH_EXPIRED': {
      try {
        await chrome.notifications.create({
          type: 'basic',
          iconUrl: 'assets/icon-128.png',
          title: 'Glassy — Re-login required',
          message: 'Your Glassy session expired. Open the Glassy extension popup to log in again so the Obsidian Bridge can reconnect.',
          priority: 2,
        })
      } catch { /* notifications may be unavailable */ }
      return { ok: true }
    }

    // Keep-alive heartbeat from the offscreen document. The offscreen doc
    // sends this every 15s to prevent Chrome MV3 from evicting it. The SW
    // just acknowledges — the sendMessage call itself is what keeps the
    // messaging channel alive from Chrome's perspective.
    case 'OFFSCREEN_HEARTBEAT':
      recordHeartbeat()
      return { ok: true }

    case 'SAVE_PAGE':
      return savePageFromPopup(message.payload)

    case 'SAVE_CAPTURE': {
      const item = message.payload
      if (!item.contentMarkdown && item.captureMode !== 'selection') {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
          if (tab?.id) {
            await ensureContentScript(tab.id, tab.url)
            const res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STRUCTURED_CONTENT' })
             // Only use the extracted content if it is substantive. An empty
             // string from the quality gate (SPA / low-content page) means we
             // should route this as a plain bookmark rather than save a junk note.
             if (res?.markdown && res.markdown.trim().length > 50) {
               item.contentMarkdown = res.markdown
             }
          }
        } catch {}
      }
      item.contentMarkdown = assemblePremiumMarkdown(item)
      return saveCaptureFromPopup(item)
    }

    case 'SAVE_BOOKMARK':
      return saveBookmarkFromPopup(message.payload)

    case 'SAVE_ALL_TABS':
      return saveAllTabsFromPopup()

    case 'SEARCH_BOOKMARKS':
      return searchBookmarksFromPopup(message.query)

    case 'SAVE_NOTE':
      return saveNoteFromPopup(message.payload)

    case 'GET_ACTIVE_TAB_META':
      return getActiveTabMeta()

    case 'CHECK_AUTH':
      return checkAuth()

    case 'LOGOUT':
      await clearAuth()
      await clearQueue()
      await chrome.storage.session.remove('glassy_badge_count')
      await chrome.action.setBadgeText({ text: '' })
      // Drop saved-URL checkmark cache so a re-login on a different account
      // doesn't show the previous user's saved-state on tab badges.
      savedUrlCache.clear()
      // Stop the Obsidian bridge SSE — it was authenticated with the now-cleared
      // JWT and would fail silently on reconnect. The user can re-enable it
      // after logging back in.
      await stopObsidianBridge().catch(() => {})
      return { ok: true }

    case 'SET_ACTIVE_ACCOUNT': {
      const accountId = message.accountId || null
      await setActiveAccountId(accountId)
      // Collections, tags, and saved-URL state are all account-scoped — drop
      // them so the next read reflects the newly selected account.
      await invalidateAccountScopedCaches().catch(() => {})
      savedUrlCache.clear()
      return { ok: true, accountId }
    }

    case 'GET_QUEUE_LENGTH': {
      const q = await getQueue()
      return { ok: true, count: q.length }
    }

    case 'CAPTURE_HIGHLIGHT': {
       const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
       if (!tab?.id) return { ok: false, error: 'No active tab' }
       return chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_HIGHLIGHT' })
    }

    // Relay: popup → service worker → content script → activate element picker.
    case 'ACTIVATE_ELEMENT_PICKER': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) return { ok: false, error: 'No active tab' }
      return chrome.tabs.sendMessage(tab.id, { type: 'ACTIVATE_ELEMENT_PICKER' })
    }

    // Relay: popup → service worker → content script → deactivate picker.
    case 'DEACTIVATE_ELEMENT_PICKER': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) return { ok: false }
      return chrome.tabs.sendMessage(tab.id, { type: 'DEACTIVATE_ELEMENT_PICKER' })
    }

    // Screenshot: service worker captures the visible tab.
    case 'CAPTURE_SCREENSHOT_INTERNAL': {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!tab?.id) throw new Error('No active tab')
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
        return { dataUrl }
      } catch (err) {
        return { error: err.message }
      }
    }

    // Region screenshot: content script sends viewport rect → SW captures → offscreen crops.
    case 'CAPTURE_REGION': {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!tab?.id) throw new Error('No active tab')
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })

        // Delegate crop to the offscreen document (it has a real DOM + canvas).
        // captureVisibleTab returns an image scaled by the page's devicePixelRatio,
        // so the CSS-pixel rect from the content script must be scaled to match.
        let croppedDataUrl = null
        try {
          await ensureOffscreen()
          const cropResult = await new Promise((resolve) => {
            chrome.runtime.sendMessage({
              type: 'OFFSCREEN_CROP_IMAGE',
              dataUrl,
              rect: message.rect,
              dpr: message.dpr || 1,
            }, (response) => {
              if (chrome.runtime.lastError) {
                // Offscreen doc unreachable — clear the ready flag so it is
                // recreated next time, then fall back to the uncropped image.
                _offscreenReady = false
                return resolve(null)
              }
              resolve(response)
            })
          })
          if (cropResult?.dataUrl) croppedDataUrl = cropResult.dataUrl
        } catch {
          // Offscreen unavailable — fall back to the uncropped viewport image.
        }

        const result = {
          dataUrl: croppedDataUrl || dataUrl,
          url: tab.url,
          title: tab.title || 'Region Screenshot',
          capturedAt: new Date().toISOString(),
          mode: croppedDataUrl ? 'region' : 'viewport',
          rect: message.rect,
        }
        await chrome.storage.local.set({ glassy_pending_screenshot: result })
        return { ok: true, cropped: !!croppedDataUrl }
      } catch (err) {
        return { ok: false, error: err.message }
      }
    }

    // Relay: popup → service worker → content script → activate region picker.
    case 'ACTIVATE_REGION_PICKER': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) return { ok: false, error: 'No active tab' }
      return chrome.tabs.sendMessage(tab.id, { type: 'ACTIVATE_REGION_PICKER' })
    }

    // Relay: popup → service worker → content script → deactivate region picker.
    case 'DEACTIVATE_REGION_PICKER': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) return { ok: false }
      return chrome.tabs.sendMessage(tab.id, { type: 'DEACTIVATE_REGION_PICKER' })
    }

    case 'CHECK_DUPLICATE_URL': {
      try {
        const result = await checkUrl(message.url)
        // Server returns { exists: true/false, id?: string }
        return { ok: true, saved: !!result?.exists, id: result?.id }
      } catch {
        return { ok: false, saved: false }
      }
    }

    case 'DELETE_CAPTURE': {
      if (!message.id) return { ok: false, error: 'Missing capture ID' }
      try {
        await deleteBookmark(message.id)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err.message }
      }
    }

    // Telemetry sink: content scripts relay handler failures here so they are
    // observable instead of vanishing silently in the page context.
    case 'CONTENT_SCRIPT_ERROR': {
      const p = message.payload || {}
      console.warn(
        `[Glassy] content-script error (${p.context || 'unknown'}) on ${p.url || 'unknown'}: ${p.message || 'no detail'}`
      )
      return { ok: true }
    }

    default:
      return { ok: false, error: 'Unknown message type' }
  }
}

/**
 * Popup-originated saves with offline-queue parity.
 *
 * Previously only background saves (context menu / keyboard shortcut) were
 * queued when the failure policy said the save was recoverable; a popup save
 * during a network drop or 5xx simply errored and the capture was lost. Now
 * every popup save path queues through the same planBackgroundSaveFailure
 * policy, and the popup shows a "Queued for sync" state (see SaveToast).
 */
async function popupSaveWithQueue(saveFn, payload, queueType) {
  try {
    const result = await saveFn(payload)
    if (!result?.duplicate) await updateBadge(1)
    return { ok: true, data: result }
  } catch (err) {
    const plan = planBackgroundSaveFailure(err)
    if (plan.queue) {
      try {
        await enqueue(queueType, payload)
        return { ok: true, queued: true, reason: plan.kind }
      } catch (queueErr) {
        return { ok: false, error: queueErr.message, code: queueErr.code }
      }
    }
    return { ok: false, error: err.message, status: err.status, kind: plan.kind }
  }
}

async function saveCaptureFromPopup(payload) {
  return popupSaveWithQueue(saveCapture, payload, 'capture')
}

async function saveBookmarkFromPopup(payload) {
  return popupSaveWithQueue(saveBookmark, payload, 'bookmark')
}

async function saveAllTabsFromPopup() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true })
    const httpTabs = tabs.filter(t => t.url && /^https?:\/\//i.test(t.url))
    let saved = 0, skipped = 0, rateLimited = false
    for (const tab of httpTabs) {
      try {
        const result = await saveBookmark({ url: tab.url, title: tab.title || tab.url })
        if (result?.duplicate) skipped++
        else saved++
      } catch (err) {
        // The ext API allows 60 requests/minute/user. Stop the batch at the
        // limit instead of burning through the remaining tabs as silent skips.
        if (err?.status === 429) { rateLimited = true; break }
        skipped++
      }
    }
    if (saved > 0) await updateBadge(saved)
    return { ok: true, saved, skipped, total: httpTabs.length, rateLimited }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

async function saveNoteFromPopup(payload) {
  return popupSaveWithQueue(saveNote, payload, 'note')
}

async function savePageFromPopup(payload) {
  return popupSaveWithQueue(saveDocument, payload, 'document')
}

async function searchBookmarksFromPopup(q) {
  try {
    const result = await searchBookmarks(String(q || '').slice(0, 200))
    return { ok: true, bookmarks: result?.bookmarks || [] }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

async function getActiveTabMeta() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab) return { ok: false, error: 'No active tab' }
    let meta = {
      url: tab.url,
      title: tab.title || '',
      favicon_url: tab.favIconUrl || '',
      description: '',
      og_image: '',
      domain: '',
    }
    try { meta.domain = new URL(tab.url).hostname } catch {}
    if (tab.id) {
      try {
        await ensureContentScript(tab.id, tab.url)
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_META' })
        if (response?.meta) meta = { ...meta, ...response.meta }
        if (response?.selectedText) meta.selectedText = response.selectedText
      } catch {}
    }
    return { ok: true, meta }
  } catch (err) { return { ok: false, error: err.message } }
}

async function checkAuth() {
  const result = await verifyToken()
  return { authenticated: result.ok, user: result.user || null }
}

/**
 * Resolve a human-readable label for the currently selected account, so save
 * notifications can show *where* an item landed (e.g. "Saved to Poziverse ✓").
 * Returns null when there's only one account or the label can't be resolved,
 * in which case callers omit the account suffix.
 */
async function getActiveAccountLabel() {
  try {
    const [activeId, user] = await Promise.all([getActiveAccountId(), getCachedUser()])
    const accounts = Array.isArray(user?.accounts) ? user.accounts : []
    if (accounts.length <= 1) return null
    const id = activeId || user?.activeAccountId
    const match = accounts.find(a => a.id === id) || accounts.find(a => a.is_primary)
    return match?.label || null
  } catch {
    return null
  }
}

async function updateBadge(increment = 0) {
  const settings = await getSettings()
  if (!settings.badgeCount) return
  const current = await chrome.storage.session.get('glassy_badge_count')
  const count = (current.glassy_badge_count || 0) + increment
  await chrome.storage.session.set({ glassy_badge_count: count })
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' })
  await chrome.action.setBadgeBackgroundColor({ color: '#6366f1' })
}

function showNotification(title, message, type = 'success') {
  const iconMap = { success: '/assets/icon-48.png', error: '/assets/icon-48.png', info: '/assets/icon-48.png' }
  chrome.notifications.create({
    type: 'basic',
    iconUrl: iconMap[type] || iconMap.info,
    title, message,
    priority: type === 'error' ? 2 : 0,
  })
}

const savedUrlCache = new Map()
async function checkSavedPageBadge(tabId, url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    await chrome.action.setBadgeText({ text: '', tabId })
    return
  }
  const token = await getToken()
  if (!token) return
  if (savedUrlCache.has(url)) {
    const saved = savedUrlCache.get(url)
    await chrome.action.setBadgeText({ text: saved ? '✓' : '', tabId })
    if (saved) await chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId })
    return
  }
  try {
    const result = await checkUrl(url)
    const saved = result?.exists === true
    savedUrlCache.set(url, saved)
    if (savedUrlCache.size > 500) {
      const first = savedUrlCache.keys().next().value
      savedUrlCache.delete(first)
    }
    await chrome.action.setBadgeText({ text: saved ? '✓' : '', tabId })
    if (saved) await chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId })
  } catch {}
}

const _badgeCheckTimers = new Map()
function debouncedCheckBadge(tabId, url) {
  if (_badgeCheckTimers.has(tabId)) clearTimeout(_badgeCheckTimers.get(tabId))
  _badgeCheckTimers.set(tabId, setTimeout(() => {
    _badgeCheckTimers.delete(tabId)
    checkSavedPageBadge(tabId, url)
  }, 250))
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId)
    if (tab?.url) debouncedCheckBadge(activeInfo.tabId, tab.url)
  } catch {}
})

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.url) {
    debouncedCheckBadge(tabId, changeInfo.url)
  }
})

// ── Storage Quota Monitoring ─────────────────────────────────────────────────
// Chrome MV3 enforces a ~10MB limit on chrome.storage.local.
// This alarm checks quota every 6 hours and warns when approaching the limit.
// (STORAGE_QUOTA_ALARM is declared near the top of this file, with the other
// alarm names, so the listener can reference it without hoisting concerns.)

const STORAGE_QUOTA_WARN_THRESHOLD = 0.8 // Warn at 80% usage
const STORAGE_QUOTA_CRITICAL_THRESHOLD = 0.95 // Critical at 95%

async function checkStorageQuota() {
  try {
    const bytesInUse = await chrome.storage.local.getBytesInUse()
    const quotaBytes = chrome.storage.local.QUOTA_BYTES || 10485760 // 10MB default
    const usageRatio = bytesInUse / quotaBytes

    if (usageRatio >= STORAGE_QUOTA_CRITICAL_THRESHOLD) {
      console.warn('[Glassy] Storage critical:', Math.round(usageRatio * 100) + '% used')
      // Auto-trim offline queue to free space — single read-modify-write,
      // preserving item ids/attempts (the old clearQueue()+re-enqueue loop
      // recreated every item and could lose entries on a mid-loop quota error).
      try {
        const queue = await getQueue()
        if (queue.length > 50) {
          await trimQueueTo(50)
          console.log('[Glassy] Trimmed offline queue from', queue.length, 'to 50 items')
        }
      } catch (queueErr) {
        console.warn('[Glassy] Queue trim failed:', queueErr.message)
      }
    } else if (usageRatio >= STORAGE_QUOTA_WARN_THRESHOLD) {
      console.warn('[Glassy] Storage warning:', Math.round(usageRatio * 100) + '% used')
    }
  } catch (err) {
    // getBytesInUse may not be available in all browsers (Firefox)
    console.warn('[Glassy] Storage quota check failed:', err.message)
  }
}

// Register the quota check alarm on startup
try {
  chrome.alarms.create(STORAGE_QUOTA_ALARM, { periodInMinutes: 360 }) // 6 hours
} catch { /* Firefox may not support alarms.create with periodInMinutes */ }
