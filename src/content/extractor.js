/**
 * Content script — runs on every page at document_idle.
 *
 * Responsibilities:
 * 1. Extract page metadata (OG tags, title, favicon, description)
 * 2. Capture current text selection
 * 3. Extract page body text for AI summary (lazy, only when requested)
 * 4. Respond to messages from the service worker / popup
 *
 * This script intentionally does NOT inject any visible UI.
 * All visual feedback is handled by the popup or service worker notifications.
 */

// ── Meta extraction ──────────────────────────────────────────────────────────

function getMeta(name) {
  return (
    document.querySelector(`meta[property="${name}"]`)?.content ||
    document.querySelector(`meta[name="${name}"]`)?.content ||
    ''
  )
}

function getFaviconUrl() {
  const link =
    document.querySelector('link[rel="icon"][href]') ||
    document.querySelector('link[rel="shortcut icon"][href]') ||
    document.querySelector('link[rel="apple-touch-icon"][href]')
  if (link) {
    try {
      return new URL(link.getAttribute('href'), location.href).href
    } catch {}
  }
  return `${location.origin}/favicon.ico`
}

function extractPageMeta() {
  const title =
    getMeta('og:title') ||
    getMeta('twitter:title') ||
    document.title ||
    ''

  const description =
    getMeta('og:description') ||
    getMeta('twitter:description') ||
    getMeta('description') ||
    ''

  const ogImage =
    getMeta('og:image') ||
    getMeta('twitter:image') ||
    ''

  const favicon = getFaviconUrl()

  let domain = ''
  try { domain = new URL(location.href).hostname } catch {}

  return {
    url: location.href,
    title: title.trim().slice(0, 500),
    description: description.trim().slice(0, 1000),
    og_image: ogImage,
    favicon_url: favicon,
    domain,
  }
}

function getSelectedText() {
  return window.getSelection()?.toString().trim().slice(0, 10000) || ''
}

/**
 * Returns the HTML of the current selection (preserves formatting).
 * Returns empty string if nothing is selected.
 */
function getSelectionHtml() {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return ''
  const container = document.createElement('div')
  for (let i = 0; i < sel.rangeCount; i++) {
    container.appendChild(sel.getRangeAt(i).cloneContents())
  }
  return container.innerHTML.trim().slice(0, 100_000)
}

function getPageText() {
  // Walk the DOM text nodes directly — avoids cloneNode(true) freeze on large docs
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const tag = node.parentElement?.tagName?.toUpperCase()
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'NAV', 'HEADER', 'FOOTER', 'ASIDE'].includes(tag)) {
          return NodeFilter.FILTER_REJECT
        }
        return NodeFilter.FILTER_ACCEPT
      },
    }
  )
  const chunks = []
  let total = 0
  let node
  while ((node = walker.nextNode()) && total < 5000) {
    const text = node.textContent.replace(/\s+/g, ' ').trim()
    if (text) {
      chunks.push(text)
      total += text.length
    }
  }
  return chunks.join(' ').slice(0, 5000)
}

// ── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'GET_PAGE_META':
      sendResponse({
        meta: extractPageMeta(),
        selectedText: getSelectedText(),
      })
      return true

    case 'GET_PAGE_TEXT':
      sendResponse({ text: getPageText() })
      return true

    case 'GET_SELECTED_TEXT':
      sendResponse({ text: getSelectedText() })
      return true

    case 'GET_SELECTION_HTML':
      sendResponse({ html: getSelectionHtml() })
      return true

    case 'GET_PAGE_HTML':
      sendResponse({
        url: location.href,
        title: document.title,
        excerpt: getPageText().slice(0, 500),
      })
      return true

    default:
      return false
  }
})
