import React, { useState, useEffect } from 'react'
import { getBaseUrl } from '../../lib/auth.js'

export default function UpsellCard({ user }) {
  const [baseUrl, setBaseUrlState] = useState('')
  useEffect(() => { getBaseUrl().then(setBaseUrlState) }, [])

  function openStore() {
    chrome.tabs.create({ url: `${baseUrl}/#/store` })
    window.close()
  }

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '8px 0' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
        <div style={{
          width: 52, height: 52, borderRadius: 16, margin: '0 auto 12px',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(124,58,237,0.2))',
          border: '1px solid rgba(99,102,241,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26,
        }}>🔖</div>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'rgba(255,255,255,0.92)', marginBottom: 6 }}>
          Unlock Glassy Keep
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, padding: '0 8px' }}>
          Save bookmarks from anywhere with one click. Smart tags, AI summaries, collections, and offline sync.
        </div>
      </div>

      {/* Feature bullets */}
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, padding: '0 4px' }}>
        {FEATURES.map((f) => (
          <li key={f.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>{f.icon}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>{f.label}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{f.desc}</div>
            </div>
          </li>
        ))}
      </ul>

      {/* Price + CTA */}
      <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>Glassy Keep</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#818cf8' }}>$9 <span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.4)' }}>one-time</span></span>
        </div>
        <button className="btn-accent" onClick={openStore}>
          ✦ Get Glassy Keep
        </button>
      </div>

      {user?.email && (
        <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
          Signed in as {user.email}
        </div>
      )}
    </div>
  )
}

const FEATURES = [
  { icon: '⚡', label: '1-click saving',      desc: 'Save any page instantly from context menu or keyboard shortcut' },
  { icon: '🤖', label: 'AI smart tags',       desc: 'Automatic tag suggestions using Gemini AI' },
  { icon: '📝', label: 'Web highlights',      desc: 'Save selected text as notes with source context' },
  { icon: '📡', label: 'Offline queue',       desc: 'Saves sync automatically when you reconnect' },
  { icon: '🗂️', label: 'Collections',         desc: 'Organize into your existing Glassy collections' },
]
