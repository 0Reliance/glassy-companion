import React, { useState } from 'react'
import { summarizePage } from '../../lib/api.js'
import { enqueue } from '../../lib/offlineQueue.js'
import SummaryCard from './SummaryCard.jsx'

export default function QuickActions({ pageMeta, onSaveNote }) {
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryText, setSummaryText]       = useState('')
  const [pageStatus, setPageStatus]         = useState('idle') // idle | saving | saved | error

  async function handleSummarize() {
    if (!pageMeta?.url || summaryLoading) return
    setSummaryLoading(true)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      let res
      try {
        res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' })
      } catch {
        // Content script unavailable on this page
        return
      }
      if (!res?.text) return
      try {
        const result = await summarizePage({ url: pageMeta.url, text: res.text, title: pageMeta.title })
        setSummaryText(result?.summary || result?.text || (typeof result === 'string' ? result : ''))
      } catch (_) {
        // fail silently — summary is bonus feature
      }
    } catch (_) {
      // ignore
    } finally {
      setSummaryLoading(false)
    }
  }

  async function handleSavePage() {
    if (pageStatus === 'saving' || pageStatus === 'saved') return
    setPageStatus('saving')

    const payload = {
      url: pageMeta?.url,
      title: pageMeta?.title || '',
    }

    // Queue for later if offline
    if (!navigator.onLine) {
      try {
        await enqueue('page', payload)
        setPageStatus('queued')
        setTimeout(() => setPageStatus('idle'), 3000)
      } catch (_) {
        setPageStatus('error')
        setTimeout(() => setPageStatus('idle'), 3000)
      }
      return
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

      // Extract page text client-side so the server doesn't need to re-fetch the URL.
      // This makes saves work for SPAs, auth-gated pages, and Cloudflare-protected sites
      // where a server-side fetch would get an empty shell or a challenge page.
      let clientContent = ''
      try {
        const textRes = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' })
        clientContent = textRes?.text || ''
      } catch {
        // Content script unavailable (e.g. chrome:// pages) — server will fetch the URL itself
      }

      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_PAGE',
        payload: {
          url: payload.url || tab?.url,
          title: payload.title || tab?.title || '',
          ...(clientContent ? { content: clientContent } : {}),
        },
      })
      if (response?.ok) {
        setPageStatus('saved')
      } else {
        setPageStatus('error')
        setTimeout(() => setPageStatus('idle'), 3000)
      }
    } catch (_) {
      setPageStatus('error')
      setTimeout(() => setPageStatus('idle'), 3000)
    }
  }

  const pageLabel = pageStatus === 'saving' ? 'Saving…'
    : pageStatus === 'saved'  ? 'Saved!'
    : pageStatus === 'queued' ? 'Queued offline'
    : pageStatus === 'error'  ? 'Failed'
    : 'Save page'

  return (
    <div>
      <div style={{ display: 'flex', gap: 7 }}>
        <button
          type="button"
          className="quick-action-btn"
          onClick={handleSavePage}
          disabled={pageStatus === 'saving' || pageStatus === 'saved'}
          title="Save this page as a readable document"
          aria-label="Save page to Glassy Keep"
        >
          {pageStatus === 'saving'
            ? <span className="spinner" style={{ width: 14, height: 14 }} aria-hidden="true" />
            : <span style={{ fontSize: 16 }} aria-hidden="true">
                {pageStatus === 'saved' ? '✅' : pageStatus === 'error' ? '⚠️' : pageStatus === 'queued' ? '📥' : '📄'}
              </span>}
          <span>{pageLabel}</span>
        </button>

        <button
          type="button"
          className="quick-action-btn"
          onClick={handleSummarize}
          disabled={summaryLoading || !!summaryText}
          title="Summarize this page with AI"
          aria-label="AI summarize this page"
        >
          {summaryLoading
            ? <span className="spinner" style={{ width: 14, height: 14 }} aria-hidden="true" />
            : <span style={{ fontSize: 16 }} aria-hidden="true">{summaryText ? '✅' : '✨'}</span>}
          <span>{summaryText ? 'Done!' : summaryLoading ? 'Working…' : 'AI summary'}</span>
        </button>
      </div>

      {/* AI Summary display */}
      {summaryText && (
        <SummaryCard
          summary={summaryText}
          onSaveAsNote={(text) => onSaveNote(text)}
          onDismiss={() => setSummaryText('')}
        />
      )}
    </div>
  )
}
