import React, { useState } from 'react'
import { enqueue } from '../../lib/offlineQueue.js'

export default function QuickActions({ pageMeta, onSaveNote, onScreenshotCaptured }) {
  const [pageStatus, setPageStatus] = useState('idle')
  const [screenshotStatus, setScreenshotStatus] = useState('idle')

  async function handleSavePage() {
    if (!pageMeta?.url || pageStatus === 'saving' || pageStatus === 'saved') return
    setPageStatus('saving')

    // Use the unified capture pipeline (SAVE_CAPTURE) instead of the legacy
    // SAVE_PAGE → saveDocument path. The service worker handles content
    // extraction and premium Markdown assembly for 'quick' captures.
    if (!navigator.onLine) {
      try {
        await enqueue('capture', {
          sourceUrl: pageMeta.url,
          title: pageMeta.title || pageMeta.url,
          captureMode: 'quick',
          status: 'inbox',
          contentType: pageMeta.contentType || 'bookmark',
          capturedAt: new Date().toISOString(),
        })
        setPageStatus('queued')
      } catch {
        setPageStatus('error')
      }
      setTimeout(() => setPageStatus('idle'), 3000)
      return
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_CAPTURE',
        payload: {
          sourceUrl: pageMeta.url,
          canonicalUrl: pageMeta.canonicalUrl,
          title: pageMeta.title || pageMeta.url,
          description: pageMeta.description || '',
          coverImageUrl: pageMeta.og_image || '',
          favicon_url: pageMeta.favicon_url || '',
          siteName: pageMeta.siteName || pageMeta.domain || '',
          author: pageMeta.author || '',
          publishedAt: pageMeta.publishedAt || null,
          contentType: pageMeta.contentType || 'bookmark',
          captureMode: 'quick',
          status: 'inbox',
          // Type-specific structured data from the interpreter — enables
          // video embed, repo card, article abstract in the Keep reader.
          structuredData: pageMeta.structuredData && Object.keys(pageMeta.structuredData).length > 0
            ? pageMeta.structuredData
            : undefined,
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
      // Route directly through the service worker — captureVisibleTab() does
      // NOT require a content script, so this works on every page including
      // restricted URLs, stale tabs, and PDFs where the content script is absent.
      const result = await chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT_INTERNAL' })
      const dataUrl = result?.dataUrl
      if (dataUrl) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        const screenshotData = {
          dataUrl,
          title: pageMeta?.title || tab?.title || 'Screenshot',
          capturedAt: Date.now(),
        }
        if (onScreenshotCaptured) {
          onScreenshotCaptured(screenshotData)
        } else {
          chrome.storage.local.set({ glassy_pending_screenshot: screenshotData }).catch(() => {})
          setScreenshotStatus('done')
          setTimeout(() => setScreenshotStatus('idle'), 2000)
        }
      } else {
        setScreenshotStatus('error')
        setTimeout(() => setScreenshotStatus('idle'), 3000)
      }
    } catch (err) {
      setScreenshotStatus('error')
      setTimeout(() => setScreenshotStatus('idle'), 3000)
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
          title="Save the readable text of this page as a note (article/research content). On app pages and SPAs, use Screenshot instead."
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
          title="Capture the visible viewport as an image — opens Smart Save so you can review and annotate before saving"
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
      </div>
    </div>
  )
}
