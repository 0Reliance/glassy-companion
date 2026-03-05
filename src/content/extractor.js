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

function getPageText() {
  // Extract readable text, strip scripts/styles, limit to MAX_PAGE_TEXT_CHARS chars
  const clone = document.body.cloneNode(true)
  clone.querySelectorAll('script, style, noscript, nav, header, footer, aside').forEach(el => el.remove())
  return (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 5000)
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

    default:
      return false
  }
})
