import React, { useState } from 'react'
import { summarizePage } from '../../lib/api.js'
import { enqueue } from '../../lib/offlineQueue.js'
import SummaryCard from './SummaryCard.jsx'

export default function QuickActions({ pageMeta, onSaveNote }) {
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryText, setSummaryText] = useState('')
  const [pageStatus, setPageStatus] = useState('idle')

  async function handleSummarize() {
    if (!pageMeta?.url || summaryLoading) return
    setSummaryLoading(true)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      let pageText = ''
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' })
        pageText = res?.text || ''
      } catch {}
      if (!pageText) return
      const result = await summarizePage({ url: pageMeta.url, text: pageText, title: pageMeta.title })
      setSummaryText(result?.summary || result?.text || (typeof result === 'string' ? result : ''))
    } catch {
      setSummaryText('')
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

  const pageLabel = pageStatus === 'saving' ? 'Saving...'
    : pageStatus === 'saved' ? 'Saved!'
    : pageStatus === 'queued' ? 'Queued offline'
    : pageStatus === 'error' ? 'Failed'
    : 'Save Page'

  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="glass-card"
          onClick={handleSavePage}
          disabled={pageStatus === 'saving' || pageStatus === 'saved'}
          style={{
            flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column',
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
          onClick={handleSummarize}
          disabled={summaryLoading || !!summaryText}
          style={{
            flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column',
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
    </div>
  )
}
