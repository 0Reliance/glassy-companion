/**
 * Glassy Companion — Visual Element Picker
 *
 * Injected into pages when the user activates "Capture Element" mode.
 * Provides a hover-to-highlight + click-to-select UX for capturing
 * specific page elements as rich Markdown.
 *
 * The popup closes before activation (MV3 restriction — popup can't
 * stay open during page interaction). Results are stored in
 * chrome.storage.local and picked up on next popup open.
 */

// ── State ────────────────────────────────────────────────────────────────────
let active = false
let resolvePromise = null
let highlightedEl = null
let overlayEl = null
let tooltipEl = null

// ── Styles ────────────────────────────────────────────────────────────────────
const PICKER_CSS = `
.glassy-picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  pointer-events: none;
}
.glassy-picker-highlight {
  position: fixed;
  z-index: 2147483647;
  pointer-events: none;
  border: 2px solid #6366f1;
  background: rgba(99, 102, 241, 0.08);
  box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.3), 0 0 24px rgba(99, 102, 241, 0.15);
  border-radius: 4px;
  transition: all 0.1s ease-out;
}
.glassy-picker-tooltip {
  position: fixed;
  z-index: 2147483647;
  pointer-events: none;
  background: #0f0f14;
  color: rgba(255,255,255,0.9);
  font-family: -apple-system, sans-serif;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  border: 1px solid rgba(99,102,241,0.3);
  max-width: 300px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
`

// ── Helpers ────────────────────────────────────────────────────────────────────

function getElementLabel(el) {
  const tag = el.tagName.toLowerCase()
  const cls = (typeof el.className === 'string' ? el.className : '').split(' ').filter(Boolean).slice(0, 2).join('.')
  const id = el.id ? `#${el.id}` : ''
  const label = cls ? `${tag}${id}.${cls}` : `${tag}${id}`

  const text = (el.textContent || '').trim().slice(0, 60)
  return text ? `${label} — "${text}"` : label
}

function isPickable(el) {
  if (!el || el === document.body || el === document.documentElement) return false
  // Skip our own injected elements
  if (el.closest?.('.glassy-picker-overlay') || el.classList?.contains?.('glassy-picker-highlight') || el.classList?.contains?.('glassy-picker-tooltip')) return false
  // Pick anything visible
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 && rect.width < window.innerWidth && rect.height < window.innerHeight
}

// ── Overlay Management ────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('glassy-picker-styles')) return
  const style = document.createElement('style')
  style.id = 'glassy-picker-styles'
  style.textContent = PICKER_CSS
  document.head.appendChild(style)
}

function ensureOverlay() {
  if (overlayEl) return
  injectStyles()
  overlayEl = document.createElement('div')
  overlayEl.className = 'glassy-picker-overlay'
  document.body.appendChild(overlayEl)

  highlightedEl = document.createElement('div')
  highlightedEl.className = 'glassy-picker-highlight'
  highlightedEl.style.display = 'none'
  document.body.appendChild(highlightedEl)

  tooltipEl = document.createElement('div')
  tooltipEl.className = 'glassy-picker-tooltip'
  tooltipEl.style.display = 'none'
  document.body.appendChild(tooltipEl)
}

function removeOverlay() {
  overlayEl?.remove(); overlayEl = null
  highlightedEl?.remove(); highlightedEl = null
  tooltipEl?.remove(); tooltipEl = null
  document.getElementById('glassy-picker-styles')?.remove()
}

function updateHighlight(el) {
  if (!el || !highlightedEl) return
  const rect = el.getBoundingClientRect()
  highlightedEl.style.display = 'block'
  highlightedEl.style.left = rect.left + 'px'
  highlightedEl.style.top = rect.top + 'px'
  highlightedEl.style.width = rect.width + 'px'
  highlightedEl.style.height = rect.height + 'px'

  // Tooltip above element
  if (tooltipEl) {
    tooltipEl.style.display = 'block'
    tooltipEl.textContent = getElementLabel(el)
    tooltipEl.style.left = Math.max(8, rect.left) + 'px'
    const tooltipTop = rect.top - 34
    tooltipEl.style.top = (tooltipTop > 4 ? tooltipTop : rect.bottom + 4) + 'px'
  }
}

function hideHighlight() {
  if (highlightedEl) highlightedEl.style.display = 'none'
  if (tooltipEl) tooltipEl.style.display = 'none'
}

// ── Mouse / Keyboard Handlers ─────────────────────────────────────────────────

function onMouseMove(e) {
  if (!active) return
  // Walk up to find a suitable pickable element
  let el = document.elementFromPoint(e.clientX, e.clientY)
  while (el && !isPickable(el)) el = el.parentElement
  updateHighlight(el)
}

function onClick(e) {
  if (!active) return
  e.preventDefault()
  e.stopPropagation()
  e.stopImmediatePropagation()

  let el = document.elementFromPoint(e.clientX, e.clientY)
  while (el && !isPickable(el)) el = el.parentElement

  if (el) {
    // Extract the selected element as rich Markdown.
    const clone = el.cloneNode(true)
    // Remove script/style from clone
    clone.querySelectorAll('script, style, noscript').forEach(n => n.remove())

    // Import nodeToMarkdown dynamically (it's already a module export)
    import('./formatter.js').then(({ nodeToMarkdown }) => {
      const markdown = nodeToMarkdown(clone)

      // Collect any images inside the element for the native gallery
      const images = []
      clone.querySelectorAll('img').forEach(img => {
        const src = img.src || img.getAttribute('src')
        if (src) {
          images.push({
            url: src,
            src,
            name: img.getAttribute('alt') || 'clipped image',
          })
        }
      })

      // Add attribution header
      const site = document.title || window.location.hostname || 'current page'
      const attributedMarkdown = `> Clipped from *${site}*\n\n${markdown}`

      const result = {
        markdown: attributedMarkdown,
        tagName: el.tagName.toLowerCase(),
        textPreview: (el.textContent || '').trim().slice(0, 200),
        capturedAt: Date.now(),
        images,
      }
      // Store result for the popup to pick up on next open.
      chrome.storage.local.set({ glassy_pending_element: result }).catch(() => {})
    }).catch(() => {})
  }

  if (resolvePromise) {
    resolvePromise({ element: el, cancelled: !el })
  }
  deactivate()
}

function onKeyDown(e) {
  if (e.key === 'Escape') {
    if (resolvePromise) resolvePromise({ element: null, cancelled: true })
    deactivate()
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Activate element picker mode. Returns a Promise that resolves with
 * { element, cancelled } — element is null if user cancelled.
 */
export function activateElementPicker() {
  if (active) return Promise.resolve({ element: null, cancelled: true })

  return new Promise((resolve) => {
    active = true
    resolvePromise = resolve
    ensureOverlay()

    document.addEventListener('mousemove', onMouseMove, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKeyDown, true)

    // Set cursor
    document.body.style.cursor = 'crosshair'
  })
}

/**
 * Deactivate picker mode (e.g., popup closed unexpectedly).
 */
export function deactivateElementPicker() {
  if (!active) return
  active = false
  resolvePromise = null

  document.removeEventListener('mousemove', onMouseMove, true)
  document.removeEventListener('click', onClick, true)
  document.removeEventListener('keydown', onKeyDown, true)

  document.body.style.cursor = ''
  hideHighlight()
  removeOverlay()
}

/**
 * Check if picker is currently active.
 */
export function isPickerActive() {
  return active
}
