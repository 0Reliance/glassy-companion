import React, { useState } from 'react'

export default function SummaryCard({ summary, onSaveAsNote, onDismiss }) {
  const [copied, setCopied] = useState(false)

  const [copyFailed, setCopyFailed] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(summary)
      setCopied(true)
      setCopyFailed(false)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyFailed(true)
      setTimeout(() => setCopyFailed(false), 2000)
    }
  }

  if (!summary) return null

  return (
    <div className="animate-in" style={{
      background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)',
      borderRadius: 10, padding: '10px 12px', marginTop: 8,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          AI Summary
        </span>
        <button onClick={onDismiss} style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
          cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2,
        }}>×</button>
      </div>
      <div style={{
        fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6,
        maxHeight: 120, overflowY: 'auto',
      }}>
        {summary}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={handleCopy}
          style={{
            flex: 1, padding: '6px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
            color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
          }}
        >
          {copied ? '✓ Copied' : copyFailed ? '⚠ Failed' : '📋 Copy'}
        </button>
        <button
          onClick={() => onSaveAsNote(summary)}
          style={{
            flex: 1, padding: '6px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
            background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
            color: '#a5b4fc', cursor: 'pointer',
          }}
        >
          📝 Save as note
        </button>
      </div>
    </div>
  )
}
