import React, { useState, useEffect } from 'react'
import { getBaseUrl } from '../../lib/auth.js'

const ICONS = { saved: '🎉', duplicate: '🔁', error: '❌' }
const TITLES = { saved: 'Saved!', duplicate: 'Already saved', error: 'Save failed' }
const COLORS = {
  saved:     { bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.25)',   text: '#86efac' },
  duplicate: { bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)',  text: '#fcd34d' },
  error:     { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.25)',   text: '#fca5a5' },
}

export default function SaveToast({ type, errorMessage, onDismiss, onSaveAnother }) {
  const [baseUrl, setBaseUrlState] = useState('')
  const color = COLORS[type] || COLORS.error

  useEffect(() => { getBaseUrl().then(setBaseUrlState) }, [])
  useEffect(() => {
    if (type === 'saved') {
      const t = setTimeout(onDismiss, 3000)
      return () => clearTimeout(t)
    }
  }, [type, onDismiss])

  function openKeep() {
    chrome.tabs.create({ url: `${baseUrl}/#/keep` })
    window.close()
  }

  return (
    <div
      className="animate-in"
      style={{
        background: color.bg, border: `1px solid ${color.border}`,
        borderRadius: 14, padding: '20px 18px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 36 }}>{ICONS[type]}</div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, color: color.text, marginBottom: 4 }}>
          {TITLES[type]}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
          {type === 'saved'     && 'Bookmark saved to your Glassy library.'}
          {type === 'duplicate' && 'This URL is already in your library.'}
          {type === 'error'     && (errorMessage || 'Something went wrong. Try again.')}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, width: '100%' }}>
        <button
          onClick={onSaveAnother}
          style={{
            flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
            color: 'rgba(255,255,255,0.65)', fontWeight: 500,
          }}
        >
          {type === 'error' ? 'Retry' : 'Back'}
        </button>
        {type !== 'error' && (
          <button className="btn-accent" style={{ flex: 1, padding: 8, fontSize: 12 }} onClick={openKeep}>
            View library
          </button>
        )}
      </div>
    </div>
  )
}
