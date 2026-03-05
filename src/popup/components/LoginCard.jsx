import React, { useState } from 'react'
import { login } from '../../lib/auth.js'

export default function LoginCard({ onLoginSuccess }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

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
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Logo lockup */}
      <div style={{ textAlign: 'center', paddingTop: 8 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 14, margin: '0 auto 10px',
          background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, boxShadow: '0 0 24px rgba(99,102,241,0.35)',
        }}>✦</div>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'rgba(255,255,255,0.92)' }}>
          Sign in to Glassy
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>
          Save bookmarks anywhere, instantly
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Email
          </label>
          <input
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
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Password
          </label>
          <input
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
      </form>

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
