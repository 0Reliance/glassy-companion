/**
 * Obsidian Bridge settings section — lets the user configure the extension
 * to proxy Obsidian requests on behalf of the Glassy server.
 *
 * This solves the WSL2/Docker networking problem: when Glassy runs in a
 * container on Windows, it can't reach Obsidian on 127.0.0.1:27124. But
 * the browser extension can. Enabling the bridge makes the extension act
 * as a local proxy between the server and Obsidian.
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  getBridgeSettings,
  saveBridgeSettings,
  getBridgeStatus,
  testObsidianConnection,
} from '../../lib/obsidianBridge.js'

const DEFAULT_URL = 'https://127.0.0.1:27124'

export default function ObsidianBridgeSection() {
  const [enabled, setEnabled] = useState(false)
  const [url, setUrl] = useState(DEFAULT_URL)
  const [token, setToken] = useState('')
  const [hasToken, setHasToken] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [connected, setConnected] = useState(false)
  const [statusError, setStatusError] = useState(null)

  // Load settings on mount
  useEffect(() => {
    getBridgeSettings().then((s) => {
      setEnabled(s.enabled)
      setUrl(s.url || DEFAULT_URL)
      setHasToken(!!s.token)
      setToken('')
    }).catch(() => {})

    // Poll bridge status every 3s while the section is mounted
    const poll = () => {
      getBridgeStatus().then((s) => {
        setConnected(s.connected)
        setStatusError(s.error)
      }).catch(() => {})
    }
    poll()
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [])

  const handleTest = useCallback(async () => {
    if (!url || (!token && !hasToken)) return
    setTesting(true)
    setTestResult(null)
    // If user didn't type a new token, test with the stored one
    const settings = await getBridgeSettings()
    const testToken = token || settings.token
    const result = await testObsidianConnection(url, testToken)
    setTestResult(result)
    setTesting(false)
  }, [url, token, hasToken])

  const handleSave = useCallback(async () => {
    setSaving(true)
    const updates = { enabled, url }
    // Only update the token if the user typed a new one
    if (token) {
      updates.token = token
    }
    await saveBridgeSettings(updates)
    setToken('')
    setHasToken(true)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }, [enabled, url, token])

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 10,
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {/* Header with toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
            Obsidian Bridge
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
            Connect the server to your vault via the extension (fixes WSL2/Docker)
          </div>
        </div>
        <div
          onClick={() => setEnabled(!enabled)}
          style={{
            width: 34, height: 19, borderRadius: 12, position: 'relative', flexShrink: 0,
            background: enabled ? 'rgba(99,102,241,0.7)' : 'rgba(255,255,255,0.12)',
            transition: 'background 0.2s', cursor: 'pointer',
          }}
        >
          <div style={{
            position: 'absolute', top: 3, width: 13, height: 13, borderRadius: '50%',
            background: 'white', transition: 'left 0.2s',
            left: enabled ? 18 : 3,
          }} />
        </div>
      </div>

      {/* Connection status badge */}
      {enabled && (
        <div style={{
          fontSize: 11, display: 'flex', alignItems: 'center', gap: 6,
          color: connected ? '#86efac' : statusError ? '#fca5a5' : 'rgba(255,255,255,0.4)',
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: connected ? '#22c55e' : statusError ? '#ef4444' : '#6b7280',
            flexShrink: 0,
          }} />
          {connected ? 'Bridge connected' : statusError || 'Disconnected'}
        </div>
      )}

      {/* Settings fields (shown when enabled) */}
      {enabled && (
        <>
          <div>
            <label style={labelStyle}>Obsidian URL</label>
            <input
              className="glass-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={DEFAULT_URL}
              style={{ fontSize: 12 }}
            />
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>
              From Obsidian → Settings → Local REST API
            </div>
          </div>

          <div>
            <label style={labelStyle}>API Key</label>
            <input
              className="glass-input"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={hasToken ? '•••••••• (saved — type to replace)' : 'Paste API key'}
              style={{ fontSize: 12 }}
            />
          </div>

          {/* Test + Save buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn-secondary"
              onClick={handleTest}
              disabled={testing || !url || (!token && !hasToken)}
              style={{ flex: 1, fontSize: 11, padding: '7px' }}
            >
              {testing ? <span className="spinner" /> : null}
              {testing ? 'Testing…' : 'Test Connection'}
            </button>
            <button
              className="btn-accent"
              onClick={handleSave}
              disabled={saving || !url}
              style={{ flex: 1, fontSize: 11, padding: '7px' }}
            >
              {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save'}
            </button>
          </div>

          {/* Test result */}
          {testResult && (
            <div style={{
              fontSize: 11,
              padding: '8px 10px',
              borderRadius: 8,
              background: testResult.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${testResult.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
              color: testResult.ok ? '#86efac' : '#fca5a5',
            }}>
              {testResult.ok ? (
                <>
                  ✓ Connected
                  {testResult.plugin?.version && ` · plugin v${testResult.plugin.version}`}
                </>
              ) : (
                <>✗ {testResult.error || `HTTP ${testResult.status}`}</>
              )}
            </div>
          )}

          {/* Hint text */}
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>
            The extension connects to Obsidian on your machine and relays
            requests from the Glassy server. Keep your browser open while
            using AI features that need vault context.
          </div>
        </>
      )}
    </div>
  )
}

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 600,
  color: 'rgba(255,255,255,0.45)', marginBottom: 5,
  textTransform: 'uppercase', letterSpacing: '0.05em',
}