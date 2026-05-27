/**
 * Glassy Companion — Service Worker (Manifest V3)
 */

import { getToken, verifyToken, clearAuth } from '../lib/auth.js'
import { saveBookmark, saveNote, saveDocument, searchBookmarks, checkUrl, saveCapture, createHighlight, deleteBookmark } from '../lib/api.js'
import { enqueue, getQueue, dequeue, incrementAttempts, clearQueue } from '../lib/offlineQueue.js'
import { getSettings } from '../lib/cache.js'
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

// ── Offscreen Document Management (MV3 Service Worker Keep-Alive) ──────────────

let _offscreenReady = false

/**
 * Ensure the offscreen document exists. Chrome MV3 allows one offscreen doc
 * per extension. We create it on first save and keep it alive.
 */
async function ensureOffscreen() {
  if (_offscreenReady) return
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
    }, (response) => {
      if (chrome.runtime.lastError) {
        // Offscreen doc failed — fall back to in-SW processing
        return resolve(processCaptureInServiceWorker(payload, tab))
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
})

chrome.runtime.onStartup.addListener(() => {
  registerContextMenus()
  ensureOfflineSyncAlarm().catch(() => {})
})

ensureOfflineSyncAlarm().catch(() => {})

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
        showNotification('Glassy — Upgrade required', 'Glassy Keep is required for this save.', 'error')
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
    showNotification('Glassy — Saved ✓', captureItem.title, 'success')
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

    for (const item of queue) {
      if (item.attempts >= 5) {
        await dequeue(item.id)
        continue
      }
      try {
        if (useOffscreen) {
          const res = await chrome.runtime.sendMessage({
            type: 'OFFSCREEN_FLUSH_QUEUE_ITEM',
            item,
          })
          if (res?.ok && (res?.synced || res?.dropped)) {
            await dequeue(item.id)
          } else if (res?.retry) {
            await incrementAttempts(item.id)
          } else {
            await incrementAttempts(item.id)
          }
        } else {
          // Legacy in-SW path
          if (item.type === 'capture') await saveCapture(item.payload)
          else if (item.type === 'bookmark') await saveBookmark(item.payload)
          else if (item.type === 'page' || item.type === 'document') await saveDocument(item.payload)
          else await saveNote(item.payload)
          await dequeue(item.id)
        }
      } catch (err) {
        const failurePlan = planQueueFailure(err)
        if (failurePlan.action === 'retry') await incrementAttempts(item.id)
        else await dequeue(item.id)
      }
    }
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
    case 'SAVE_PAGE':
      return savePageFromPopup(message.payload)

    case 'SAVE_CAPTURE': {
      const item = message.payload
      if (!item.contentMarkdown && item.captureMode !== 'selection') {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
          if (tab?.id) {
             const res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STRUCTURED_CONTENT' })
             if (res?.markdown) item.contentMarkdown = res.markdown
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
      return { ok: true }

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

    default:
      return { ok: false, error: 'Unknown message type' }
  }
}

async function saveCaptureFromPopup(payload) {
  try {
    const result = await saveCapture(payload)
    if (!result?.duplicate) await updateBadge(1)
    return { ok: true, data: result }
  } catch (err) {
    return { ok: false, error: err.message, status: err.status }
  }
}

async function saveBookmarkFromPopup(payload) {
  try {
    const result = await saveBookmark(payload)
    if (!result?.duplicate) await updateBadge(1)
    return { ok: true, data: result }
  } catch (err) {
    return { ok: false, error: err.message, status: err.status }
  }
}

async function saveAllTabsFromPopup() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true })
    const httpTabs = tabs.filter(t => t.url && /^https?:\/\//i.test(t.url))
    let saved = 0, skipped = 0
    for (const tab of httpTabs) {
      try {
        const result = await saveBookmark({ url: tab.url, title: tab.title || tab.url })
        if (result?.duplicate) skipped++
        else saved++
      } catch { skipped++ }
    }
    if (saved > 0) await updateBadge(saved)
    return { ok: true, saved, skipped, total: httpTabs.length }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

async function saveNoteFromPopup(payload) {
  try {
    const result = await saveNote(payload)
    return { ok: true, data: result }
  } catch (err) {
    return { ok: false, error: err.message, status: err.status }
  }
}

async function savePageFromPopup(payload) {
  try {
    const result = await saveDocument(payload)
    if (!result?.duplicate) await updateBadge(1)
    return { ok: true, data: result }
  } catch (err) {
    return { ok: false, error: err.message, status: err.status }
  }
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
