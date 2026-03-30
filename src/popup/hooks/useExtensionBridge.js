/**
 * Extension bridge — wraps chrome.runtime.sendMessage for clean async usage.
 */

function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError)
      resolve(response)
    })
  })
}

export function checkAuth() {
  return sendMessage({ type: 'CHECK_AUTH' })
}

export function getActiveTabMeta() {
  return sendMessage({ type: 'GET_ACTIVE_TAB_META' })
}

export function saveBookmark(payload) {
  return sendMessage({ type: 'SAVE_BOOKMARK', payload })
}

export function saveNote(payload) {
  return sendMessage({ type: 'SAVE_NOTE', payload })
}

export function saveAllTabs() {
  return sendMessage({ type: 'SAVE_ALL_TABS' })
}

export function searchBookmarks(query) {
  return sendMessage({ type: 'SEARCH_BOOKMARKS', query })
}

export function logout() {
  return sendMessage({ type: 'LOGOUT' })
}

export function getQueueLength() {
  return sendMessage({ type: 'GET_QUEUE_LENGTH' })
}
