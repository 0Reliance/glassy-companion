/**
 * Glassy Companion — Service Worker (Manifest V3)
 *
 * Handles:
 * - Context menu registration at install
 * - Context menu click → save bookmark / note
 * - Keyboard command: quick-save current tab without opening popup
 * - Messages from popup (relay API calls for auth token access)
 * - Offline queue flushing via chrome.alarms
 * - Badge count updates
 */

import { getToken, verifyToken, clearAuth } from '../lib/auth.js'
import { saveBookmark, saveNote, searchBookmarks, checkUrl } from '../lib/api.js'
import { enqueue, getQueue, dequeue, incrementAttempts, clearQueue } from '../lib/offlineQueue.js'
import { getSettings } from '../lib/cache.js'
import { planBackgroundSaveFailure, planQueueFailure } from './savePolicy.js'
import {
  CTX_SAVE_PAGE,
  CTX_SAVE_LINK,
  CTX_SAVE_SELECTION,
  CTX_QUICK_NOTE,
  ALARM_OFFLINE_SYNC,
} from '../lib/constants.js'

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
      title: 'Save page to Glassy Keep',
      contexts: ['page', 'frame'],
    })

    chrome.contextMenus.create({
      id: CTX_SAVE_LINK,
      title: 'Save link to Glassy Keep',
      contexts: ['link'],
    })

    chrome.contextMenus.create({
      id: CTX_SAVE_SELECTION,
      title: 'Save selection as Glassy Note',
      contexts: ['selection'],
    })

    chrome.contextMenus.create({
      id: CTX_QUICK_NOTE,
      title: 'New Glassy Note',
      contexts: ['page', 'frame'],
    })
  })
}

// ── Context menu handler ──────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case CTX_SAVE_PAGE:
      await backgroundSave('bookmark', { url: tab.url }, tab)
      break

    case CTX_SAVE_LINK:
      if (info.linkUrl) {
        await backgroundSave('bookmark', { url: info.linkUrl }, tab)
      }
      break

    case CTX_SAVE_SELECTION: {
      const selectedText = info.selectionText?.trim()
      if (!selectedText) break
      await backgroundSave('note', {
        content: `${selectedText}\n\n*Saved from: [${tab.title}](${tab.url})*`,
        title: `Note from ${new URL(tab.url).hostname}`,
        tags: [],
      }, tab)
      break
    }

    case CTX_QUICK_NOTE:
      // Open popup in note mode
      await chrome.action.openPopup?.()
        .catch(() => {})
      // Set a flag so popup opens to note view
      await chrome.storage.session.set({ glassy_open_view: 'note' })
      break
  }
})

// ── Keyboard command handler ──────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'quick-save') {
    // Quick-save current page silently (no popup)
    await backgroundSave('bookmark', { url: tab.url }, tab)
  }
  if (command === 'quick-note') {
    // Open popup to note view
    await chrome.storage.session.set({ glassy_open_view: 'note' })
    await chrome.action.openPopup?.().catch(() => {})
  }
})

// ── Background save ───────────────────────────────────────────────────────────

/**
 * Save a bookmark or note in the background (no popup interaction).
 * Shows a notification with the result.
 * If offline, adds to queue.
 */
async function backgroundSave(type, payload, tab) {
  const token = await getToken()
  if (!token) {
    showNotification('Not logged in', 'Open the Glassy Companion popup to log in.', 'error')
    return
  }

  const settings = await getSettings()
  const savePayload = type === 'bookmark'
    ? { ...payload, ai_tag: settings.aiAutoTag }
    : payload

  // For bookmarks, extract metadata from the content script first
  if (type === 'bookmark' && tab?.id && !savePayload.title) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_META' })
      if (response?.meta) {
        Object.assign(savePayload, response.meta)
      }
    } catch {
      // Content script not ready or restricted page — continue with just URL
    }
  }

  if (!navigator.onLine) {
    await enqueue(type, savePayload)
    showNotification('Glassy — Queued', 'You\'re offline. This will sync when you reconnect.', 'info')
    return
  }

  try {
    const result = type === 'bookmark'
      ? await saveBookmark(savePayload)
      : await saveNote(savePayload)

    if (result?.duplicate) {
      showNotification('Glassy — Already Saved', `"${savePayload.title || savePayload.url}" is already in your Keep.`, 'info')
    } else {
      showNotification(
        type === 'bookmark' ? 'Glassy — Saved to Keep ✓' : 'Glassy — Note Saved ✓',
        savePayload.title || savePayload.url || 'Saved successfully',
        'success'
      )
      await updateBadge(1)
      // Update saved-page cache for instant badge
      if (type === 'bookmark' && savePayload.url) {
        savedUrlCache.set(savePayload.url, true)
      }
    }
  } catch (err) {
    const failurePlan = planBackgroundSaveFailure(err)

    if (failurePlan.queue) {
      await enqueue(type, savePayload)
    }

    switch (failurePlan.kind) {
      case 'duplicate':
        showNotification('Glassy — Already Saved', `"${savePayload.title || savePayload.url}" is already in your Keep.`, 'info')
        break
      case 'auth':
        showNotification('Session Expired', 'Save queued. Open the extension popup to log in again.', 'error')
        break
      case 'entitlement':
        showNotification('Glassy Keep Required', 'Purchase Glassy Keep in the dashboard store ($9).', 'error')
        break
      case 'retryable':
        showNotification('Glassy — Queued', 'Save failed — will retry automatically.', 'info')
        break
      default:
        showNotification('Glassy — Save Failed', err?.message || 'Could not save this item.', 'error')
    }
  }
}

// ── Offline queue flush ───────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== ALARM_OFFLINE_SYNC) return
  if (!navigator.onLine) return

  const queue = await getQueue()
  if (queue.length === 0) return

  const token = await getToken()
  if (!token) return

  let synced = 0
  let duplicates = 0
  let droppedForEntitlement = 0
  let droppedAsFatal = 0
  for (const item of queue) {
    if (item.attempts >= 5) {
      // Give up after 5 attempts
      await dequeue(item.id)
      continue
    }

    try {
      if (item.type === 'bookmark') {
        await saveBookmark(item.payload)
      } else {
        await saveNote(item.payload)
      }
      await dequeue(item.id)
      synced++
    } catch (err) {
      const failurePlan = planQueueFailure(err)

      if (failurePlan.action === 'pause') {
        showNotification('Session Expired', 'Queued saves are paused until you log in again.', 'error')
        break
      }

      if (failurePlan.action === 'retry') {
        await incrementAttempts(item.id)
        continue
      }

      await dequeue(item.id)

      if (failurePlan.kind === 'duplicate') {
        duplicates++
      } else if (failurePlan.kind === 'entitlement') {
        droppedForEntitlement++
      } else {
        droppedAsFatal++
      }
    }
  }

  if (synced > 0) {
    showNotification('Glassy — Synced', `${synced} queued item${synced === 1 ? '' : 's'} saved.`, 'success')
  }

  if (duplicates > 0) {
    showNotification('Glassy — Up To Date', `${duplicates} queued item${duplicates === 1 ? '' : 's'} already existed in Keep.`, 'info')
  }

  if (droppedForEntitlement > 0) {
    showNotification('Glassy Keep Required', `${droppedForEntitlement} queued item${droppedForEntitlement === 1 ? '' : 's'} could not be saved without Glassy Keep.`, 'error')
  }

  if (droppedAsFatal > 0) {
    showNotification('Glassy — Save Failed', `${droppedAsFatal} queued item${droppedAsFatal === 1 ? '' : 's'} could not be recovered automatically.`, 'error')
  }
})

// ── Message handler (from popup) ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => {
    sendResponse({ ok: false, error: err.message })
  })
  return true // Keep channel open for async response
})

async function handleMessage(message) {
  switch (message.type) {
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
      return { ok: true }

    case 'GET_QUEUE_LENGTH': {
      const q = await getQueue()
      return { ok: true, count: q.length }
    }

    default:
      return { ok: false, error: 'Unknown message type' }
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
        if (result?.duplicate) { skipped++ } else { saved++; await updateBadge(1) }
      } catch {
        skipped++
      }
    }
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

    try {
      const domain = new URL(tab.url).hostname
      meta.domain = domain
    } catch {}

    // Try to get richer metadata from content script
    if (tab.id) {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_META' })
        if (response?.meta) {
          meta = { ...meta, ...response.meta }
        }
        if (response?.selectedText) {
          meta.selectedText = response.selectedText
        }
      } catch {
        // Content script may not be available on restricted pages (chrome://, etc.)
      }
    }

    return { ok: true, meta }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

async function checkAuth() {
  const result = await verifyToken()
  // Popup expects { authenticated, user } shape
  return { authenticated: result.ok, user: result.user || null }
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

async function updateBadge(increment = 0) {
  const settings = await getSettings()
  if (!settings.badgeCount) return

  const current = await chrome.storage.session.get('glassy_badge_count')
  const count = (current.glassy_badge_count || 0) + increment
  await chrome.storage.session.set({ glassy_badge_count: count })
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' })
  await chrome.action.setBadgeBackgroundColor({ color: '#6366f1' })
}

// ── Notifications ─────────────────────────────────────────────────────────────

function showNotification(title, message, type = 'success') {
  const iconMap = {
    success: '/assets/icon-48.png',
    error: '/assets/icon-48.png',
    info: '/assets/icon-48.png',
  }
  chrome.notifications.create({
    type: 'basic',
    iconUrl: iconMap[type] || iconMap.info,
    title,
    message,
    priority: type === 'error' ? 2 : 0,
  })
}

// ── Saved-page badge ──────────────────────────────────────────────────────────

// Cache of recently checked URLs → boolean (in-memory, cleared on restart)
const savedUrlCache = new Map()

async function checkSavedPageBadge(tabId, url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    await chrome.action.setBadgeText({ text: '', tabId })
    return
  }

  const token = await getToken()
  if (!token) return

  // Check memory cache first
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
    // Evict old entries
    if (savedUrlCache.size > 500) {
      const first = savedUrlCache.keys().next().value
      savedUrlCache.delete(first)
    }
    await chrome.action.setBadgeText({ text: saved ? '✓' : '', tabId })
    if (saved) await chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId })
  } catch {
    // Silently fail — don't disrupt UX
  }
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId)
    if (tab?.url) await checkSavedPageBadge(activeInfo.tabId, tab.url)
  } catch {}
})

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.url) {
    await checkSavedPageBadge(tabId, changeInfo.url)
  }
})
