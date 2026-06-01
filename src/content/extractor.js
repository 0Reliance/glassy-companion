/**
 * Content script — runs on every page at document_idle.
 */
import { nodeToMarkdown } from './formatter.js'
import { runInterpreter } from './interpreters/registry.js'

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

function extractSchemaOrg() {
  const schemas = []
  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try {
      const data = JSON.parse(script.innerText)
      if (Array.isArray(data)) schemas.push(...data)
      else schemas.push(data)
    } catch {}
  })
  return schemas
}

function detectContentType(meta, schemas) {
  const domain = meta.domain?.toLowerCase() || ''
  if (domain.includes('youtube.com') || domain.includes('vimeo.com')) return 'video'
  if (domain.includes('github.com') || domain.includes('gitlab.com')) return 'repo'
  if (domain.includes('arxiv.org')) return 'research'
  if (domain.includes('substack.com')) return 'article'

  for (const s of schemas) {
    const type = s['@type']
    if (type === 'VideoObject') return 'video'
    if (type === 'Product') return 'product'
    if (type === 'ScholarlyArticle') return 'research'
    if (type === 'NewsArticle' || type === 'BlogPosting') return 'article'
  }

  const ogType = getMeta('og:type').toLowerCase()
  if (ogType.includes('video')) return 'video'
  if (ogType.includes('article')) return 'article'
  if (ogType.includes('product')) return 'product'

  return 'bookmark'
}

async function extractPageMeta() {
  const title_ = getMeta('og:title') || getMeta('twitter:title') || document.title || ''
  const description_ = getMeta('og:description') || getMeta('twitter:description') || getMeta('description') || ''
  const ogImage = getMeta('og:image') || getMeta('twitter:image') || ''
  const favicon = getFaviconUrl()

  let domain = ''
  try { domain = new URL(location.href).hostname } catch {}

  const author = getMeta('author') || getMeta('article:author') || ''
  const publishedAt = getMeta('article:published_time') || ''
  const schemas = extractSchemaOrg()

  const meta = {
    url: location.href,
    canonicalUrl: document.querySelector('link[rel="canonical"]')?.href || location.href,
    title: title_.trim().slice(0, 500),
    description: description_.trim().slice(0, 1000),
    og_image: ogImage,
    favicon_url: favicon,
    domain,
    author,
    publishedAt,
    siteName: getMeta('og:site_name') || domain,
  }

  meta.contentType = detectContentType(meta, schemas)

  // Run site-specific interpreter for enriched metadata.
  try {
    const enriched = await runInterpreter(location.href, document)
    if (enriched?.enriched) {
      // Override/extend with interpreter metadata.
      Object.assign(meta, enriched.metadata)
      if (enriched.contentType) meta.contentType = enriched.contentType
      meta.interpreterSite = enriched.site
    }
  } catch {
    // interpreter failed — generic meta is still usable
  }

  return meta
}

// ── Content extraction ───────────────────────────────────────────────────────

function findMainContent() {
  const article = document.querySelector('article')
  if (article) return article

  const containers = document.querySelectorAll('main, .content, .article, #content, .post')
  for (const c of containers) {
    if (c.textContent.length > 500) return c
  }

  return document.body
}

function getStructuredContent() {
  const main = findMainContent()
  const clone = main.cloneNode(true)
  const noise = clone.querySelectorAll('script, style, nav, header, footer, aside, .ads, .social-share')
  noise.forEach(n => n.remove())
  return nodeToMarkdown(clone)
}

function getSelectionMarkdown() {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return ''
  let markdown = ''
  for (let i = 0; i < sel.rangeCount; i++) {
    const container = document.createElement('div')
    container.appendChild(sel.getRangeAt(i).cloneContents())
    markdown += nodeToMarkdown(container)
  }
  return markdown.trim()
}

// Added for test compatibility
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

// ── Highlights ───────────────────────────────────────────────────────────────

function getSelector(node) {
  if (!node) return ''
  if (node.id) return `#${node.id}`
  let path = []
  let curr = node
  while (curr && curr.parentElement) {
    let index = Array.from(curr.parentElement.children).indexOf(curr) + 1
    path.unshift(`${curr.tagName.toLowerCase()}:nth-child(${index})`)
    curr = curr.parentElement
  }
  return path.join(' > ')
}

function captureHighlight() {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  return {
    id: crypto.randomUUID(),
    text: sel.toString().trim(),
    selector: getSelector(range.startContainer.parentElement),
    pageTitle: document.title,
    sourceUrl: location.href,
    createdAt: new Date().toISOString()
  }
}

// ── Error telemetry ──────────────────────────────────────────────────────────
// Content-script failures used to vanish: a thrown handler left sendResponse
// uncalled (the popup then hung until its message timeout) and nothing was
// logged. reportContentError surfaces the failure to the console AND relays a
// compact record to the service worker so these errors become observable.
// The reporter is best-effort and must never throw — a failing reporter must
// not mask the original error.
function reportContentError(context, err) {
  const detail = err?.message || String(err)
  console.warn(`[Glassy content] ${context} failed:`, detail)
  try {
    chrome.runtime
      .sendMessage({
        type: 'CONTENT_SCRIPT_ERROR',
        payload: { context, message: detail, url: location.href },
      })
      ?.catch(() => {}) // relay is best-effort; ignore delivery failures
  } catch {
    // sendMessage can throw synchronously if the extension context is gone
  }
}

// Run a synchronous handler and always send a response, converting a thrown
// error into a structured { error } payload (instead of leaving the channel
// open) so the popup gets a definitive answer and the failure is reported.
function respondSync(context, sendResponse, fn) {
  try {
    sendResponse(fn())
  } catch (err) {
    reportContentError(context, err)
    sendResponse({ error: err?.message || `${context} failed` })
  }
}

// ── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false

  switch (message.type) {
    case 'GET_PAGE_META':
      extractPageMeta().then(meta => {
        sendResponse({
          meta,
          selectedText: window.getSelection()?.toString().trim().slice(0, 1000)
        })
      }).catch(err => {
        reportContentError('GET_PAGE_META', err)
        sendResponse({ error: err?.message || 'page meta extraction failed' })
      })
      return true // async

    case 'GET_STRUCTURED_CONTENT':
      respondSync('GET_STRUCTURED_CONTENT', sendResponse, () => ({ markdown: getStructuredContent() }))
      break

    case 'GET_SELECTION_MARKDOWN':
      respondSync('GET_SELECTION_MARKDOWN', sendResponse, () => ({ markdown: getSelectionMarkdown() }))
      break

    case 'CAPTURE_HIGHLIGHT':
      respondSync('CAPTURE_HIGHLIGHT', sendResponse, () => ({ highlight: captureHighlight() }))
      break

    // Compatibility cases
    case 'GET_PAGE_TEXT':
      respondSync('GET_PAGE_TEXT', sendResponse, () => ({ text: getPageText() }))
      break
    case 'GET_SELECTED_TEXT':
      respondSync('GET_SELECTED_TEXT', sendResponse, () => ({
        text: window.getSelection()?.toString().trim().slice(0, 10000) || ''
      }))
      break
    case 'GET_SELECTION_HTML':
      respondSync('GET_SELECTION_HTML', sendResponse, () => ({ html: getSelectionHtml() }))
      break
    case 'GET_PAGE_HTML':
      respondSync('GET_PAGE_HTML', sendResponse, () => ({
        url: location.href,
        title: document.title,
        excerpt: (document.body?.innerText || '').slice(0, 500)
      }))
      break

      case 'ACTIVATE_ELEMENT_PICKER': {
      // Activate the element picker. The popup has already closed.
      // Results are stored in chrome.storage.local for the next popup open.
      import('./elementPicker.js').then(mod => {
        mod.activateElementPicker()
      }).catch(() => {})
      sendResponse({ ok: true })
      break
    }

    case 'DEACTIVATE_ELEMENT_PICKER':
      import('./elementPicker.js').then(mod => {
        mod.deactivateElementPicker()
        sendResponse({ ok: true })
      }).catch(() => sendResponse({ ok: false }))
      return true

    case 'CAPTURE_SCREENSHOT': {
      // Request viewport screenshot via the background service worker.
      // The content script can't call tabs.captureVisibleTab directly;
      // we relay to the service worker which has that permission.
      chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT_INTERNAL' }).then(result => {
        sendResponse(result) // service worker already returns { dataUrl } shape
      }).catch(err => {
        sendResponse({ error: err.message })
      })
      return true
    }

    default:
      return false
  }
  return true
})
