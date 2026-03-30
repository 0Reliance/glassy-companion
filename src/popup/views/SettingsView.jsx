import React, { useState, useEffect } from 'react'
import { getSettings, saveSettings, invalidateCollections } from '../../lib/cache.js'
import { getBaseUrl, setBaseUrl } from '../../lib/auth.js'
import { logout, getQueueLength } from '../hooks/useExtensionBridge.js'

export default function SettingsView({ user, onClose, onLogout }) {
  const [baseUrl, setBaseUrlState] = useState('')
  const [aiTag, setAiTag] = useState(true)
  const [notifications, setNotifs] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [queueCount, setQueueCount] = useState(0)

  useEffect(() => {
    getBaseUrl().then(setBaseUrlState).catch(() => {})
    getSettings().then((s) => {
      setAiTag(s.aiAutoTag ?? true)
      setNotifs(s.showNotifications ?? true)
    }).catch(() => {})
  }, [])

  async function handleSave() {
    setSaving(true)
    const prev = await getBaseUrl()
    if (baseUrl.trim() && baseUrl.trim() !== prev) {
      await setBaseUrl(baseUrl.trim().replace(/\/$/, ''))
      await invalidateCollections()
    }
    await saveSettings({ aiAutoTag: aiTag, showNotifications: notifications })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  async function handleLogoutClick() {
    if (confirmLogout) {
      await logout().catch(() => {})
      onLogout()
      return
    }
    // Check offline queue before confirming
    try {
      const res = await getQueueLength()
      setQueueCount(res?.count || 0)
    } catch {
      setQueueCount(0)
    }
    setConfirmLogout(true)
  }

  return (
    <div className="animate-in" style={{ padding: '12px 14px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>Settings</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 2 }}>×</button>
      </div>

      {/* User info */}
      {user?.email && (
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700,
          }}>
            {user.email[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.email}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
              {user.entitlements?.glassy_keep ? '✦ Glassy Keep' : 'Free'}
            </div>
          </div>
        </div>
      )}

      {/* Server URL */}
      <div>
        <label style={labelStyle}>Glassy server URL</label>
        <input
          className="glass-input"
          value={baseUrl}
          onChange={(e) => setBaseUrlState(e.target.value)}
          placeholder="https://glassy.fyi"
          style={{ fontSize: 12 }}
        />
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
          Change if you self-host Glassy
        </div>
      </div>

      {/* Toggles */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Toggle label="AI auto-tagging" desc="Tag bookmarks automatically using AI" value={aiTag} onChange={setAiTag} />
        <Toggle label="Desktop notifications" desc="Show notification after saving" value={notifications} onChange={setNotifs} />
      </div>

      {/* Save settings */}
      <button className="btn-accent" onClick={handleSave} disabled={saving}>
        {saving ? <span className="spinner" /> : null}
        {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save settings'}
      </button>

      <div className="divider" />

      {/* Logout with confirmation */}
      {confirmLogout ? (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 10, padding: '12px', display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ fontSize: 12, color: '#fca5a5', fontWeight: 600 }}>
            Sign out?
          </div>
          {queueCount > 0 && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
              You have <strong style={{ color: '#fcd34d' }}>{queueCount}</strong> unsaved item{queueCount === 1 ? '' : 's'} in your offline queue. Signing out will lose them.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setConfirmLogout(false)}
              style={{
                flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
                color: 'rgba(255,255,255,0.65)', fontWeight: 500,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleLogoutClick}
              style={{
                flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                color: '#fca5a5', fontWeight: 600,
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleLogoutClick}
          style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 8, padding: '9px', color: '#fca5a5',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', width: '100%',
          }}
        >
          Sign out
        </button>
      )}
    </div>
  )
}

function Toggle({ label, desc, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{desc}</div>
      </div>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: 34, height: 19, borderRadius: 12, position: 'relative', flexShrink: 0,
          background: value ? 'rgba(99,102,241,0.7)' : 'rgba(255,255,255,0.12)',
          transition: 'background 0.2s', cursor: 'pointer',
        }}
      >
        <div style={{
          position: 'absolute', top: 3, width: 13, height: 13, borderRadius: '50%',
          background: 'white', transition: 'left 0.2s',
          left: value ? 18 : 3,
        }} />
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 600,
  color: 'rgba(255,255,255,0.45)', marginBottom: 5,
  textTransform: 'uppercase', letterSpacing: '0.05em',
}
