/**
 * Glassy Companion — Region Screenshot Picker
 *
 * Dark overlay with drag-to-select rectangle. When the user releases the mouse,
 * the selected viewport coordinates are sent to the service worker for capture
 * and cropping.
 */

// ── State ────────────────────────────────────────────────────────────────────
let active = false
let overlayEl = null
let selectionEl = null
let startX = 0
let startY = 0
let isDragging = false

// ── Styles ──────────────────────────────────────────────────────────────────
const REGION_CSS = `
.glassy-region-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  background: rgba(0, 0, 0, 0.35);
  cursor: crosshair;
}
.glassy-region-selection {
  position: fixed;
  z-index: 2147483647;
  border: 2px solid #6366f1;
  background: rgba(99, 102, 241, 0.12);
  box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.3), 0 0 24px rgba(99, 102, 241, 0.15);
  border-radius: 4px;
  pointer-events: none;
  display: none;
}
.glassy-region-tooltip {
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
  white-space: nowrap;
}
`

// ── Overlay Management ──────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('glassy-region-styles')) return
  const style = document.createElement('style')
  style.id = 'glassy-region-styles'
  style.textContent = REGION_CSS
  document.head.appendChild(style)
}

function ensureOverlay() {
  if (overlayEl) return
  injectStyles()
  overlayEl = document.createElement('div')
  overlayEl.className = 'glassy-region-overlay'
  document.body.appendChild(overlayEl)

  selectionEl = document.createElement('div')
  selectionEl.className = 'glassy-region-selection'
  document.body.appendChild(selectionEl)
}

function removeOverlay() {
  overlayEl?.remove(); overlayEl = null
  selectionEl?.remove(); selectionEl = null
  document.getElementById('glassy-region-styles')?.remove()
}

function updateSelection(x, y, w, h) {
  if (!selectionEl) return
  selectionEl.style.display = 'block'
  selectionEl.style.left = x + 'px'
  selectionEl.style.top = y + 'px'
  selectionEl.style.width = w + 'px'
  selectionEl.style.height = h + 'px'
}

function hideSelection() {
  if (selectionEl) selectionEl.style.display = 'none'
}

// ── Mouse Handlers ───────────────────────────────────────────────────────────

function onMouseDown(e) {
  if (!active) return
  isDragging = true
  startX = e.clientX
  startY = e.clientY
  updateSelection(startX, startY, 0, 0)
}

function onMouseMove(e) {
  if (!active || !isDragging) return
  const x = Math.min(startX, e.clientX)
  const y = Math.min(startY, e.clientY)
  const w = Math.abs(e.clientX - startX)
  const h = Math.abs(e.clientY - startY)
  updateSelection(x, y, w, h)
}

function onMouseUp(e) {
  if (!active || !isDragging) return
  isDragging = false

  const x = Math.min(startX, e.clientX)
  const y = Math.min(startY, e.clientY)
  const w = Math.abs(e.clientX - startX)
  const h = Math.abs(e.clientY - startY)

  // Minimum selection size (ignore accidental clicks)
  if (w < 4 || h < 4) {
    deactivateRegionPicker()
    return
  }

  // Send region to service worker for capture + crop
  const rect = {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(w),
    height: Math.round(h),
  }
  const dpr = window.devicePixelRatio || 1

  // Tear down the overlay FIRST so the dark selection chrome is not captured,
  // then wait two animation frames for the repaint before requesting capture.
  deactivateRegionPicker()
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      chrome.runtime.sendMessage({ type: 'CAPTURE_REGION', rect, dpr }).catch(() => {})
    })
  })
}

function onKeyDown(e) {
  if (e.key === 'Escape') {
    deactivateRegionPicker()
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function activateRegionPicker() {
  if (active) return
  active = true
  ensureOverlay()
  document.addEventListener('mousedown', onMouseDown, true)
  document.addEventListener('mousemove', onMouseMove, true)
  document.addEventListener('mouseup', onMouseUp, true)
  document.addEventListener('keydown', onKeyDown, true)
}

export function deactivateRegionPicker() {
  if (!active) return
  active = false
  isDragging = false
  document.removeEventListener('mousedown', onMouseDown, true)
  document.removeEventListener('mousemove', onMouseMove, true)
  document.removeEventListener('mouseup', onMouseUp, true)
  document.removeEventListener('keydown', onKeyDown, true)
  hideSelection()
  removeOverlay()
}

export function isRegionPickerActive() {
  return active
}
