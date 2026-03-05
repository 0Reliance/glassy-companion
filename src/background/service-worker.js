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

import { getToken, verifyToken, clearAuth, getBaseUrl } from '../lib/auth.js'
import { saveBookmark, saveNote, checkUrl } from '../lib/api.js'
import { enqueue, getQueue, dequeue, incrementAttempts, clearQueue } from '../lib/offlineQueue.js'
import { getSettings } from '../lib/cache.js'
import {
  CTX_SAVE_PAGE,
  CTX_SAVE_LINK,
  CTX_SAVE_SELECTION,
  ALARM_OFFLINE_SYNC,
} from '../lib/constants.js'

// ── Install / startup ─────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  registerContextMenus()
  chrome.alarms.create(ALARM_OFFLINE_SYNC, { periodInMinutes: 1 })
})

chrome.runtime.onStartup.addListener(() => {
  registerContextMenus()
})

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
  }
})

// ── Keyboard command handler ──────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'quick-save') {
    // Quick-save current page silently (no popup)
    await backgroundSave('bookmark', { url: tab.url }, tab)
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

  // For bookmarks, extract metadata from the content script first
  if (type === 'bookmark' && tab?.id && !payload.title) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_META' })
      if (response?.meta) {
        Object.assign(payload, response.meta)
      }
    } catch {
      // Content script not ready or restricted page — continue with just URL
    }
  }

  if (!navigator.onLine) {
    await enqueue(type, payload)
    showNotification('Glassy — Queued', 'You\'re offline. This will sync when you reconnect.', 'info')
    return
  }

  try {
    const settings = await getSettings()
    const savePayload = type === 'bookmark'
      ? { ...payload, ai_tag: settings.aiAutoTag }
      : payload

    const result = type === 'bookmark'
      ? await saveBookmark(savePayload)
      : await saveNote(savePayload)

    if (result?.duplicate) {
      showNotification('Glassy — Already Saved', `"${payload.title || payload.url}" is already in your Keep.`, 'info')
    } else {
      showNotification(
        type === 'bookmark' ? 'Glassy — Saved to Keep ✓' : 'Glassy — Note Saved ✓',
        payload.title || payload.url || 'Saved successfully',
        'success'
      )
      await updateBadge(1)
    }
  } catch (err) {
    if (err?.status === 403) {
      showNotification('Glassy Keep Required', 'Purchase Glassy Keep in the dashboard store ($9).', 'error')
    } else if (err?.status === 401) {
      showNotification('Session Expired', 'Open the extension popup to log in again.', 'error')
    } else {
      // Queue for retry
      await enqueue(type, payload)
      showNotification('Glassy — Queued', 'Save failed — will retry automatically.', 'info')
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
    } catch {
      await incrementAttempts(item.id)
    }
  }

  if (synced > 0) {
    showNotification('Glassy — Synced', `${synced} queued item${synced === 1 ? '' : 's'} saved.`, 'success')
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

async function saveNoteFromPopup(payload) {
  try {
    const result = await saveNote(payload)
    return { ok: true, data: result }
  } catch (err) {
    return { ok: false, error: err.message, status: err.status }
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
  return result
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
