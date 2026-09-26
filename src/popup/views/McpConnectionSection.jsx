/**
 * MCP Connection settings section — lets the user fetch their MCP API key
 * and copy a ready-to-paste config snippet for Claude Desktop, Cursor, and
 * other MCP-compatible AI clients.
 *
 * Calls POST /api/ext/mcp-token (server-side endpoint in extensionRoutes.js)
 * which either returns the existing MCP key or generates one on the fly.
 * The key is displayed once with a copy button; it is never stored in
 * extension storage for security (it's in the server's user_providers table).
 *
 * Availability comes from the capability manifest via useServerContract, NOT from
 * probing /mcp/status. See the git history for interpretStatus(): it demanded a
 * `mounted` field from an endpoint that has never emitted one, so this section was
 * unreachable on every server that ever shipped — worst on the appliance it exists for.
 */

import React, { useState, useCallback } from 'react'
import { getMcpToken, createNamedMcpKey } from '../../lib/api.js'
import useServerContract from '../hooks/useServerContract.js'

export default function McpConnectionSection() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null) // { mcpUrl, mcpToken, generated, createdAt }
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [showKey, setShowKey] = useState(false)

  // MCP availability is the manifest's `mcp.mounted` claim — what the process actually
  // ACHIEVED, not what the config intended (#125). `=== true`, so an older manifest
  // with no such key fails closed. The section itself is only rendered when this is
  // true (SettingsView), so there is no "unavailable" copy left to get wrong here.
  const { contract } = useServerContract()
  const mcpAvailable = contract.mcp.available

  // Named keys are an appliance capability. Minting one identifies an EXTERNAL MCP
  // client (Claude Desktop, Cursor) by name; it does not make this extension an agent.
  // Saves from the extension are attributed to the human — extensionRoutes records
  // actor:{kind:'human'} — and that is correct: a person clicking Save is the person.
  const namedKeysMode = !!(mcpAvailable && contract.agentIdentity?.mode === 'named-keys')
  const [namedKey, setNamedKey] = useState(null) // { id, key, agentName } — shown ONCE

  const handleFetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    setCopied(false)
    try {
      const data = await getMcpToken()
      setResult(data)
    } catch (err) {
      // Distinguish 403 (MCP bridge disabled on server) from other errors
      const msg = err?.message || ''
      if (msg.includes('403') || msg.includes('not enabled') || msg.includes('forbidden')) {
        // True on both instance types. The old copy told a cloud user to ask an admin to
        // set server env vars — they are not the admin, and cloud MCP is off by design.
        setError('MCP is not available on this Glassy server. On the self-host appliance, enable it in Settings → AI tools (MCP).')
      } else {
        setError(msg || 'Failed to fetch MCP key. Check your network connection and server URL.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Prefer a just-minted NAMED key so "copy config" gives the user the identity they
  // asked for. Before this the snippet was built only from result.mcpToken, so the
  // named-key flow was a dead end: mint a key, copy the config, get the anonymous one.
  const effectiveToken = namedKey?.key || result?.mcpToken
  const configSnippet = result
    ? JSON.stringify({
        mcpServers: {
          glassy: {
            url: result.mcpUrl,
            headers: { Authorization: `Bearer ${effectiveToken}` },
          },
        },
      }, null, 2)
    : ''

  const handleCopySnippet = useCallback(() => {
    if (!configSnippet) return
    navigator.clipboard.writeText(configSnippet).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }, [configSnippet])

  const handleCopyKey = useCallback(() => {
    if (!result?.mcpToken) return
    navigator.clipboard.writeText(result.mcpToken).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }, [result])

  // Issue a NAMED key for this extension (self-host, named-keys mode). The key
  // is shown once — the server stores only its hash, so a lost key means
  // issuing a fresh one. A duplicate name (409) means one already exists; the
  // message says so instead of a generic failure.
  const handleIssueNamedKey = useCallback(async () => {
    setLoading(true)
    setError(null)
    setCopied(false)
    try {
      const created = await createNamedMcpKey({ agentName: 'Companion' })
      setNamedKey(created)
    } catch (err) {
      const msg = err?.message || ''
      if (err?.status === 409 || /already exists/i.test(msg)) {
        setError('A Companion key already exists. Use the MCP key manager (Settings on the dashboard) to revoke it first if you lost the key.')
      } else if (err?.status === 403) {
        setError('Named keys are a self-host capability — this server is the hosted service.')
      } else {
        setError(msg || 'Failed to issue a named key.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const handleCopyNamedKey = useCallback(() => {
    if (!namedKey?.key) return
    navigator.clipboard.writeText(namedKey.key).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }, [namedKey])

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 10,
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>🧠</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>
          AI Tools (MCP)
        </span>
      </div>

      {/* Description */}
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
        Connect AI assistants like Claude Desktop, Cursor, or Windsurf to your
        Glassy knowledge base. They can search your notes, bookmarks, and vault
        files directly via the Model Context Protocol.
      </div>

      {/* Named-key flow (self-host, named-keys mode): this extension becomes a
          VERIFIED principal. The key is displayed once and never stored. */}
      {namedKeysMode && !namedKey && (
        <div data-testid="named-key-section" style={{
          background: 'rgba(99,102,241,0.08)', borderRadius: 8, padding: 10,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
            This appliance supports <strong>named agent keys</strong>. Mint one for an
            external MCP client (Claude Desktop, Cursor, Windsurf) so that client is
            identified by name in your activity feed instead of sharing one anonymous
            key. Saves made <em>from this extension</em> are always attributed to you —
            it acts as you, not as an agent.
          </div>
          <button
            onClick={handleIssueNamedKey}
            disabled={loading}
            style={{
              alignSelf: 'flex-start', padding: '6px 10px', fontSize: 11, cursor: 'pointer',
              background: 'rgba(99,102,241,0.25)', color: '#c7d2fe',
              border: '1px solid rgba(99,102,241,0.4)', borderRadius: 6,
            }}
          >
            {loading ? 'Minting…' : 'Mint a named key for an AI client'}
          </button>
        </div>
      )}

      {namedKeysMode && namedKey && (
        <div data-testid="named-key-result" style={{
          background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
          borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontSize: 11, color: '#6ee7b7', fontWeight: 600 }}>
            Named key issued — agent: {namedKey.agentName}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
            Shown once, never stored by the extension. Paste it into your MCP client —
            the config snippet below already uses it.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <code data-testid="named-key-value" style={{
              flex: 1, fontSize: 10, padding: '4px 6px',
              background: 'rgba(0,0,0,0.3)', borderRadius: 4,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {namedKey.key}
            </code>
            <button onClick={handleCopyNamedKey} style={{
              padding: '4px 8px', fontSize: 10, cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4,
            }}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Fetch button or result. There is no "MCP unavailable" branch and no
          "Checking…" state any more: SettingsView only renders this section when the
          manifest says mcp.mounted, so both were unreachable. The env-var advice that
          used to live here was wrong on cloud (not the user's var to set) and, once
          interpretStatus started returning false everywhere, wrong on self-host too. */}
      {!result && (
        <button
          onClick={handleFetch}
          disabled={loading}
          style={{
            padding: '8px 12px', borderRadius: 8, cursor: loading ? 'wait' : 'pointer',
            fontSize: 12, fontWeight: 600,
            background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)',
            color: '#a5b4fc',
          }}
        >
          {loading ? <span className="spinner" /> : null}
          {loading ? 'Fetching…' : 'Get MCP Key & Config'}
        </button>
      )}

      {error && (
        <div style={{
          fontSize: 11, color: '#fca5a5', lineHeight: 1.5,
          background: 'rgba(239,68,68,0.06)', borderRadius: 6, padding: '8px',
        }}>
          {error}
        </div>
      )}

      {result && (
        <>
          {result.generated && (
            <div style={{
              fontSize: 11, color: '#fcd34d', lineHeight: 1.5,
              background: 'rgba(250,204,21,0.06)', borderRadius: 6, padding: '8px',
            }}>
              A new MCP key was generated for you. Save it securely — it cannot
              be retrieved later without regenerating.
            </div>
          )}

          {/* MCP URL */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 4 }}>
              MCP Server URL
            </label>
            <div style={{
              fontSize: 11, color: 'rgba(255,255,255,0.6)',
              background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 8px',
              fontFamily: 'monospace', wordBreak: 'break-all',
            }}>
              {result.mcpUrl}
            </div>
          </div>

          {/* MCP Key */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 4 }}>
              MCP API Key
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{
                flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.6)',
                background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 8px',
                fontFamily: 'monospace', wordBreak: 'break-all', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: showKey ? 'normal' : 'nowrap',
              }}>
                {showKey ? result.mcpToken : 'gky_mcp_••••••••••••••••'}
              </div>
              <button
                onClick={() => setShowKey(!showKey)}
                style={{
                  padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
                  color: 'rgba(255,255,255,0.5)',
                }}
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
              <button
                onClick={handleCopyKey}
                style={{
                  padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                  background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)',
                  color: '#a5b4fc',
                }}
              >
                {copied ? '✓' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Config snippet */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 4 }}>
              Config snippet (Claude Desktop, Cursor, etc.)
            </label>
            <pre style={{
              fontSize: 10, color: 'rgba(255,255,255,0.65)',
              background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '8px',
              fontFamily: 'monospace', overflow: 'auto', maxHeight: 120,
              margin: 0, lineHeight: 1.4,
            }}>
              {configSnippet}
            </pre>
            <button
              onClick={handleCopySnippet}
              style={{
                marginTop: 6, padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                fontSize: 11, fontWeight: 600, width: '100%',
                background: copied ? 'rgba(34,197,94,0.12)' : 'rgba(99,102,241,0.12)',
                border: copied ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(99,102,241,0.3)',
                color: copied ? '#86efac' : '#a5b4fc',
              }}
            >
              {copied ? '✓ Copied to clipboard' : 'Copy config snippet'}
            </button>
          </div>

          {/* Refresh button */}
          <button
            onClick={handleFetch}
            disabled={loading}
            style={{
              padding: '6px 10px', borderRadius: 6, cursor: loading ? 'wait' : 'pointer',
              fontSize: 11, fontWeight: 500,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.4)',
            }}
          >
            {loading ? 'Fetching…' : 'Refresh key'}
          </button>
        </>
      )}
    </div>
  )
}