import React, { useState } from 'react'
import { summarizePage } from '../../lib/api.js'
import { enqueue } from '../../lib/offlineQueue.js'
import SummaryCard from './SummaryCard.jsx'

export default function QuickActions({ pageMeta, onSaveNote, onCaptureElement }) {
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryText, setSummaryText] = useState('')
  const [summaryError, setSummaryError] = useState('')
  const [pageStatus, setPageStatus] = useState('idle')
  const [screenshotStatus, setScreenshotStatus] = useState('idle')
  const [elementPickerActive, setElementPickerActive] = useState(false)

  async function handleSummarize() {
    if (!pageMeta?.url || summaryLoading) return
    setSummaryLoading(true)
    setSummaryError('')
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      let pageText = ''
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' })
        pageText = res?.text || ''
      } catch {}
      if (!pageText) {
        setSummaryError("Can't read this page (try a regular http(s) page).")
        return
      }
      const result = await summarizePage({ url: pageMeta.url, text: pageText, title: pageMeta.title })
      const summary = result?.summary || result?.text || (typeof result === 'string' ? result : '')
      if (!summary) {
        setSummaryError('No summary returned.')
      } else {
        setSummaryText(summary)
      }
    } catch (err) {
      setSummaryError(err?.message || 'Summary failed.')
    } finally {
      setSummaryLoading(false)
    }
  }

  async function handleSavePage() {
    if (!pageMeta?.url || pageStatus === 'saving' || pageStatus === 'saved') return
    setPageStatus('saving')

    const payload = {
      url: pageMeta.url,
      title: pageMeta.title || pageMeta.url,
    }

    if (!navigator.onLine) {
      try {
        await enqueue('page', payload)
        setPageStatus('queued')
      } catch {
        setPageStatus('error')
      }
      setTimeout(() => setPageStatus('idle'), 3000)
      return
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      let content = ''
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' })
        content = res?.text || ''
      } catch {}

      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_PAGE',
        payload: {
          url: payload.url || tab?.url,
          title: payload.title || tab?.title || '',
          ...(content ? { content } : {}),
        },
      })
      const nextStatus = response?.ok ? 'saved' : 'error'
      setPageStatus(nextStatus)
      if (nextStatus !== 'saved') setTimeout(() => setPageStatus('idle'), 3000)
    } catch {
      setPageStatus('error')
      setTimeout(() => setPageStatus('idle'), 3000)
    }
  }

  async function handleCaptureScreenshot() {
    if (screenshotStatus !== 'idle') return
    setScreenshotStatus('capturing')
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_SCREENSHOT' })
      if (res?.dataUrl) {
        if (onCaptureElement) {
          onCaptureElement({ type: 'screenshot', dataUrl: res.dataUrl, title: pageMeta?.title || tab?.title || 'Screenshot' })
        }
        setScreenshotStatus('done')
        setTimeout(() => setScreenshotStatus('idle'), 2000)
      } else {
        setScreenshotStatus('error')
        setTimeout(() => setScreenshotStatus('idle'), 3000)
      }
    } catch (err) {
      setScreenshotStatus('error')
      setTimeout(() => setScreenshotStatus('idle'), 3000)
    }
  }

  async function handleElementPicker() {
    if (elementPickerActive) return
    setElementPickerActive(true)
    try {
      // Close the popup so the user can interact with the page.
      window.close()
      // Small delay to let popup close, then activate picker via service worker.
      await new Promise(r => setTimeout(r, 400))
      chrome.runtime.sendMessage({ type: 'ACTIVATE_ELEMENT_PICKER' }).catch(() => {})
      // Result will be stored in chrome.storage.local by the content script
      // and available when the user re-opens the popup.
    } catch {
      // silently fail — user can re-open the popup
    }
  }

  const pageLabel = pageStatus === 'saving' ? 'Saving...'
    : pageStatus === 'saved' ? 'Saved!'
    : pageStatus === 'queued' ? 'Queued offline'
    : pageStatus === 'error' ? 'Failed'
    : 'Save Page'

  const screenshotLabel = screenshotStatus === 'capturing' ? 'Wait...'
    : screenshotStatus === 'done' ? 'Captured!'
    : screenshotStatus === 'error' ? 'Failed'
    : 'Screenshot'

  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="glass-card"
          onClick={handleSavePage}
          disabled={pageStatus === 'saving' || pageStatus === 'saved'}
          style={{
            flex: 1, padding: '10px 4px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 6, cursor: pageStatus === 'saving' ? 'default' : 'pointer', background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)', transition: 'all 0.2s'
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
        >
          {pageStatus === 'saving'
            ? <span className="spinner" style={{ width: 14, height: 14 }} />
            : <span style={{ fontSize: 16 }}>{pageStatus === 'saved' ? '✓' : pageStatus === 'error' ? '!' : pageStatus === 'queued' ? '↓' : '📄'}</span>}
          <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            {pageLabel}
          </span>
        </button>
        <button
          type="button"
          className="glass-card"
          onClick={handleCaptureScreenshot}
          disabled={screenshotStatus !== 'idle'}
          style={{
            flex: 1, padding: '10px 4px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 6, cursor: screenshotStatus !== 'idle' ? 'default' : 'pointer', background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)', transition: 'all 0.2s'
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
        >
          {screenshotStatus === 'capturing'
            ? <span className="spinner" style={{ width: 14, height: 14 }} />
            : <span style={{ fontSize: 16 }}>{screenshotStatus === 'done' ? '✓' : screenshotStatus === 'error' ? '!' : '📸'}</span>}
          <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            {screenshotLabel}
          </span>
        </button>
        <button
          type="button"
          className="glass-card"
          onClick={handleElementPicker}
          disabled={elementPickerActive}
          style={{
            flex: 1, padding: '10px 4px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 6, cursor: elementPickerActive ? 'default' : 'pointer', background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)', transition: 'all 0.2s'
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
          title="Click an element on the page to capture it as Markdown"
        >
          <span style={{ fontSize: 16 }}>🎯</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            Element
          </span>
        </button>
        <button
          type="button"
          className="glass-card"
          onClick={handleSummarize}
          disabled={summaryLoading || !!summaryText}
          style={{
            flex: 1, padding: '10px 4px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 6, cursor: summaryLoading ? 'default' : 'pointer', background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)', transition: 'all 0.2s'
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
        >
          {summaryLoading
            ? <span className="spinner" style={{ width: 14, height: 14 }} />
            : <span style={{ fontSize: 16 }}>{summaryText ? '✓' : '✨'}</span>}
          <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            {summaryText ? 'Done!' : summaryLoading ? 'Working...' : 'AI Summary'}
          </span>
        </button>
      </div>

      {summaryText && (
        <SummaryCard
          summary={summaryText}
          onSaveAsNote={onSaveNote}
          onDismiss={() => setSummaryText('')}
        />
      )}

      {summaryError && !summaryText && (
        <div
          role="alert"
          style={{
            marginTop: 8, padding: '8px 10px',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 8, fontSize: 11, color: '#fca5a5',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          }}
        >
          <span>{summaryError}</span>
          <button
            onClick={() => setSummaryError('')}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
            aria-label="Dismiss"
          >×</button>
        </div>
      )}
    </div>
  )
}
