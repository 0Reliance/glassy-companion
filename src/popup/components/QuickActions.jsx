import React, { useState } from 'react'
import { summarizePage } from '../../lib/api.js'
import SummaryCard from './SummaryCard.jsx'

export default function QuickActions({ pageMeta, onSaveNote }) {
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryText, setSummaryText]       = useState('')
  const [selectionDone, setSelectionDone]   = useState(false)
  const [selectionError, setSelectionError] = useState(false)

  async function handleSummarize() {
    if (!pageMeta?.url || summaryLoading) return
    setSummaryLoading(true)
    try {
      // Ask content script for page text, then summarize
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' }, async (res) => {
        if (chrome.runtime.lastError || !res?.text) {
          setSummaryLoading(false)
          return
        }
        try {
          const result = await summarizePage({ url: pageMeta.url, text: res.text, title: pageMeta.title })
          setSummaryText(result?.summary || result?.text || (typeof result === 'string' ? result : ''))
        } catch (_) {
          // fail silently — summary is bonus feature
        }
        setSummaryLoading(false)
      })
    } catch (_) {
      setSummaryLoading(false)
    }
  }

  async function handleSaveSelection() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTED_TEXT' }, (res) => {
        if (chrome.runtime.lastError) return
        const text = res?.text?.trim()
        if (!text) {
          setSelectionError(true)
          setTimeout(() => setSelectionError(false), 2500)
          return
        }
        onSaveNote(text)
        setSelectionDone(true)
      })
    } catch (_) {}
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 7 }}>
        <button
          type="button"
          className="quick-action-btn"
          onClick={handleSaveSelection}
          disabled={selectionDone}
          title="Save selected text as a note"
          style={selectionError ? { borderColor: 'rgba(239,68,68,0.4)' } : undefined}
        >
          <span style={{ fontSize: 16 }}>{selectionDone ? '✅' : selectionError ? '⚠️' : '✍️'}</span>
          <span>{selectionDone ? 'Saved!' : selectionError ? 'Select text first' : 'Save selection'}</span>
        </button>

        <button
          type="button"
          className="quick-action-btn"
          onClick={handleSummarize}
          disabled={summaryLoading || !!summaryText}
          title="Summarize this page with AI"
        >
          {summaryLoading
            ? <span className="spinner" style={{ width: 14, height: 14 }} />
            : <span style={{ fontSize: 16 }}>{summaryText ? '✅' : '✨'}</span>}
          <span>{summaryText ? 'Done!' : summaryLoading ? 'Working…' : 'AI summary'}</span>
        </button>

        <button
          type="button"
          className="quick-action-btn"
          onClick={() => chrome.tabs.create({ url: pageMeta?.url })}
          title="Open in new tab"
        >
          <span style={{ fontSize: 16 }}>↗️</span>
          <span>Open tab</span>
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
