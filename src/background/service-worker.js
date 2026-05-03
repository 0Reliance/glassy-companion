/**
 * Glassy Companion — Service Worker (Manifest V3)
 */

import { getToken, verifyToken, clearAuth } from '../lib/auth.js'
import { saveBookmark, saveNote, saveDocument, searchBookmarks, checkUrl, saveCapture } from '../lib/api.js'
import { enqueue, getQueue, dequeue, incrementAttempts, clearQueue, QueueFullError } from '../lib/offlineQueue.js'
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
      await backgroundSave('quick', { url: tab.url }, tab)
      break

    case CTX_SAVE_LINK:
      if (info.linkUrl) {
        await backgroundSave('quick', { url: info.linkUrl }, tab)
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
        title: `Note from ${new URL(tab.url).hostname}`,
      }, tab)
      break
    }

    case CTX_QUICK_NOTE:
      await chrome.action.openPopup?.().catch(() => {})
      await chrome.storage.session.set({ glassy_open_view: 'note' })
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
})

// ── Background save ───────────────────────────────────────────────────────────

/**
 * Premium Content Presentation
 */
function assemblePremiumMarkdown(item) {
  const dateStr = new Date(item.capturedAt || Date.now()).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  let header = `# ${item.title}\n\n`
  header += `**Source:** [${item.siteName || item.domain || 'Source'}](${item.sourceUrl})\n`
  if (item.author) header += `**Author:** ${item.author}\n`
  header += `**Captured on:** ${dateStr}\n\n`

  if (item.note) {
    header += `### Personal Note\n\n${item.note}\n\n---\n\n`
  }

  if (item.highlights?.length) {
    header += `### Highlights\n\n`
    item.highlights.forEach(h => {
      header += `> ${h.text.replace(/\n/g, '\n> ')}\n\n`
    })
    header += `---\n\n`
  }

  return header + (item.contentMarkdown || '')
}

async function backgroundSave(mode, payload, tab) {
  const token = await getToken()
  if (!token) {
    showNotification('Not logged in', 'Open the Glassy Companion popup to log in.', 'error')
    return
  }

  const captureItem = {
    sourceUrl: payload.url || tab?.url,
    title: payload.title || tab?.title || 'Untitled',
    captureMode: mode,
    status: 'inbox',
    capturedAt: new Date().toISOString(),
    ...payload
  }

  if (tab?.id) {
    try {
      const metaRes = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_META' })
      if (metaRes?.meta) {
        Object.assign(captureItem, {
          canonicalUrl: metaRes.meta.canonicalUrl,
          title: (captureItem.title === 'Untitled' || !captureItem.title) ? metaRes.meta.title : captureItem.title,
          description: metaRes.meta.description,
          coverImageUrl: metaRes.meta.og_image,
          favicon_url: metaRes.meta.favicon_url,
          siteName: metaRes.meta.siteName,
          author: metaRes.meta.author,
          publishedAt: metaRes.meta.publishedAt,
          contentType: metaRes.meta.contentType,
        })
      }

      if (mode === 'quick') {
        const contentRes = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STRUCTURED_CONTENT' })
        if (contentRes?.markdown) captureItem.contentMarkdown = contentRes.markdown
      }
    } catch {}
  }

  if (!captureItem.contentType) captureItem.contentType = 'bookmark'

  captureItem.contentMarkdown = assemblePremiumMarkdown(captureItem)

  if (!navigator.onLine) {
    try {
      await enqueue('capture', captureItem)
      showNotification('Glassy — Queued', 'You\'re offline.', 'info')
    } catch (err) {
      showNotification('Glassy — Save Failed', 'Could not queue this item.', 'error')
    }
    return
  }

  try {
    await saveCapture(captureItem)
    showNotification('Glassy — Saved ✓', captureItem.title, 'success')
    await updateBadge(1)
  } catch (err) {
    const failurePlan = planBackgroundSaveFailure(err)
    if (failurePlan.queue) await enqueue('capture', captureItem)
  }
}

// ── Offline queue flush ───────────────────────────────────────────────────────

let _queueFlushing = false

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== ALARM_OFFLINE_SYNC) return
  if (!navigator.onLine || _queueFlushing) return
  _queueFlushing = true

  try {
    const queue = await getQueue()
    if (queue.length === 0) return
    const token = await getToken()
    if (!token) return

    for (const item of queue) {
      if (item.attempts >= 5) {
        await dequeue(item.id)
        continue
      }
      try {
        if (item.type === 'capture') await saveCapture(item.payload)
        else if (item.type === 'bookmark') await saveBookmark(item.payload)
        else await saveNote(item.payload)
        await dequeue(item.id)
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

    default:
      return { ok: false, error: 'Unknown message type' }
  }
}

async function saveCaptureFromPopup(payload) {
  try {
    const result = await saveCapture(payload)
    await updateBadge(1)
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
