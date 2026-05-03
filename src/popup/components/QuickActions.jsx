import React from 'react'

export default function QuickActions({ pageMeta, onSaveNote }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button
        className="glass-card"
        style={{
          flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)', transition: 'all 0.2s'
        }}
        onClick={() => onSaveNote(pageMeta.excerpt || 'Saved page')}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
      >
        <span style={{ fontSize: 16 }}>📄</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
          Save Page
        </span>
      </button>
      <button
        className="glass-card"
        style={{
          flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)', transition: 'all 0.2s'
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
      >
        <span style={{ fontSize: 16 }}>✨</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
          AI Summary
        </span>
      </button>
    </div>
  )
}
