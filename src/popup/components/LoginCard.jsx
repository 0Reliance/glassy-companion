import React, { useState, useEffect } from 'react'
import { login, getBaseUrl, setBaseUrl } from '../../lib/auth.js'
import { invalidateCollections } from '../../lib/cache.js'
import { DEFAULT_BASE_URL } from '../../lib/constants.js'

/** Strip the scheme for a compact host display (e.g. "clear.glassy.fyi"). */
function displayHost(url) {
  try { return new URL(url).host } catch { return url }
}

export default function LoginCard({ onLoginSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Server selection — exposed BEFORE login so users who self-host (or point at
  // a Clear/dev instance) can choose their server first, instead of having to
  // sign in to the default, change the URL, then sign out and back in.
  const [serverUrl, setServerUrl] = useState(DEFAULT_BASE_URL)
  const [editingServer, setEditingServer] = useState(false)
  const [serverDraft, setServerDraft] = useState('')
  const [serverError, setServerError] = useState('')

  useEffect(() => {
    getBaseUrl().then((url) => {
      setServerUrl(url)
      setServerDraft(url)
    }).catch(() => {})
  }, [])

  async function handleServerSave() {
    const next = serverDraft.trim().replace(/\/$/, '')
    if (!next) { setEditingServer(false); return }
    try {
      await setBaseUrl(next)
      // Collections are server-scoped — drop any cache from a previous server.
      await invalidateCollections().catch(() => {})
      setServerUrl(next)
      setServerError('')
      setEditingServer(false)
    } catch (err) {
      setServerError(err.message || 'Invalid server URL.')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    setError('')
    try {
      const result = await login(email.trim().toLowerCase(), password)
      if (!result.ok) {
        setError(result.error || 'Login failed. Check your credentials.')
        return
      }
      onLoginSuccess(result.user)
    } catch (err) {
      setError(err.message || 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 4 }}>
      {/* Heading — header already shows the brand chip, so keep this lean. */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.01em' }}>
          Sign in to Glassy
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
          Save bookmarks, notes, and pages from anywhere.
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label htmlFor="companion-email" style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Email
          </label>
          <input
            id="companion-email"
            name="email"
            className="glass-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            disabled={loading}
          />
        </div>
        <div>
          <label htmlFor="companion-password" style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Password
          </label>
          <input
            id="companion-password"
            name="password"
            className="glass-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            disabled={loading}
          />
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 8, padding: '8px 12px',
            fontSize: 12, color: '#fca5a5',
          }}>
            {error}
          </div>
        )}

        <button type="submit" className="btn-accent" disabled={loading || !email || !password} style={{ marginTop: 4 }}>
          {loading ? <span className="spinner" /> : null}
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <div style={{
          textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.35)',
          marginTop: 2,
        }}>
          You'll stay signed in on this device.
        </div>
      </form>

      {/* Server selector — available before login to avoid the sign-in/switch/
          sign-out dance when pointing at a self-hosted or Clear instance. */}
      <div style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 10, padding: '10px 12px',
      }}>
        {!editingServer ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Server
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                {displayHost(serverUrl)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setServerDraft(serverUrl); setServerError(''); setEditingServer(true) }}
              style={{
                flexShrink: 0, padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 11,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
                color: 'rgba(255,255,255,0.6)', fontWeight: 500,
              }}
            >
              Change
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label htmlFor="companion-server" style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Glassy server URL
            </label>
            <input
              id="companion-server"
              className="glass-input"
              type="url"
              value={serverDraft}
              onChange={(e) => setServerDraft(e.target.value)}
              placeholder="https://glassy.fyi"
              autoComplete="off"
              style={{ fontSize: 12 }}
            />
            {serverError && (
              <div style={{ fontSize: 11, color: '#fca5a5' }}>{serverError}</div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => { setEditingServer(false); setServerError('') }}
                style={{
                  flex: 1, padding: '7px', borderRadius: 7, cursor: 'pointer', fontSize: 11,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
                  color: 'rgba(255,255,255,0.6)', fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleServerSave}
                style={{
                  flex: 1, padding: '7px', borderRadius: 7, cursor: 'pointer', fontSize: 11,
                  background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.3)',
                  color: '#c4b5fd', fontWeight: 600,
                }}
              >
                Use this server
              </button>
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
              Self-hosting? Point this at your own Glassy instance.
            </div>
          </div>
        )}
      </div>

      {/* Footer link */}
      <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.35)', paddingBottom: 4 }}>
        Don't have an account?{' '}
        <a
          href="https://glassy.fyi"
          target="_blank"
          rel="noreferrer"
          style={{ color: '#818cf8', textDecoration: 'none' }}
          onClick={(e) => { e.preventDefault(); chrome.tabs.create({ url: 'https://glassy.fyi' }) }}
        >
          Get Glassy
        </a>
      </div>
    </div>
  )
}
