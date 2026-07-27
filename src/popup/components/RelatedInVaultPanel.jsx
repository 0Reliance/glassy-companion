import React, { useState, useEffect, useCallback } from 'react'
import { searchVault, openInObsidian, getObsidianStatus, ApiError } from '../../lib/api.js'

/**
 * RelatedInVaultPanel — Phase C: shows vault notes related to the current page.
 *
 * Searches the vault for the page title (debounced) and shows the top 3-5
 * matching notes. Clicking a result opens it in Obsidian.
 *
 * Only renders when the bridge is connected — invisible otherwise (no wasted
 * vertical space). Collapsible: starts collapsed, expands on click to keep
 * the popup's vertical budget tight.
 */
export default function RelatedInVaultPanel({ pageTitle }) {
  const [connected, setConnected] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Check bridge connection once on mount
  useEffect(() => {
    let cancelled = false
    getObsidianStatus()
      .then((s) => { if (!cancelled) setConnected(!!s?.connected) })
      .catch(() => { if (!cancelled) setConnected(false) })
    return () => { cancelled = true }
  }, [])

  // Debounced search when expanded + title available
  useEffect(() => {
    if (!expanded || !pageTitle || !connected) return
    let cancelled = false
    setLoading(true)
    setError(null)
    const timer = setTimeout(async () => {
      try {
        const query = extractSearchQuery(pageTitle)
        if (!query) { if (!cancelled) { setResults([]); setLoading(false) }; return }
        const raw = await searchVault(query)
        if (cancelled) return
        const hits = normalizeSearchResults(raw).slice(0, 5)
        setResults(hits)
      } catch (err) {
        if (!cancelled) setError(humanizeError(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 400) // 400ms debounce
    return () => { cancelled = true; clearTimeout(timer) }
  }, [expanded, pageTitle, connected])

  const handleOpen = useCallback(async (filename) => {
    try { await openInObsidian(filename) } catch { /* non-fatal */ }
  }, [])

  // Don't render if not connected (saves vertical space)
  if (connected === false) return null
  if (connected === null) return null // still checking

  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          width: '100%', padding: '6px 10px',
          background: 'transparent', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 8, color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 500,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span>📂 Related in your vault</span>
        <span style={{ fontSize: 9 }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div style={{ marginTop: 6, maxHeight: 160, overflowY: 'auto' }}>
          {loading && <div style={{ padding: '8px 4px', fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Searching vault…</div>}
          {error && <div style={{ padding: '8px 4px', fontSize: 10, color: '#fca5a5' }}>{error}</div>}
          {!loading && !error && results && results.length === 0 && (
            <div style={{ padding: '8px 4px', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>No related notes found</div>
          )}
          {!loading && !error && results?.length > 0 && results.map((r, i) => (
            <button
              key={i}
              onClick={() => handleOpen(r.filename)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                padding: '5px 8px', background: 'transparent', border: 'none',
                borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                color: 'rgba(255,255,255,0.65)', fontSize: 10,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ opacity: 0.4, flexShrink: 0 }}>📄</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.filename.split('/').pop()}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Extract a meaningful search query from a page title. Strips common noise
 * (site names, trailing pipes, parentheses) and takes the first few words.
 */
function extractSearchQuery(title) {
  if (!title) return ''
  // Remove common noise: " | SiteName", " - SiteName", "(2024)", etc.
  const cleaned = title
    .replace(/\s*[|·–-]\s*[^|·–-]+$/g, '') // trailing site name
    .replace(/\s*\([^)]*\)\s*/g, ' ')       // parenthetical
    .replace(/\s+/g, ' ')
    .trim()
  // Take first 4 words to keep the query focused
  const words = cleaned.split(' ').slice(0, 4).join(' ')
  return words.slice(0, 60)
}

/**
 * Normalize the Obsidian search/simple response to [{filename, score}].
 * The API passes through Obsidian's raw response which can vary slightly.
 */
function normalizeSearchResults(raw) {
  if (!raw) return []
  if (!Array.isArray(raw)) {
    if (raw.results && Array.isArray(raw.results)) return raw.results
    return []
  }
  return raw.map((r) => ({
    filename: r.filename || r.path || '',
    score: r.score || 0,
  })).filter((r) => r.filename)
}

function humanizeError(err) {
  if (!err) return 'Search failed'
  if (err.status === 400) return 'Obsidian not configured'
  if (err.status === 502) return "Can't reach Obsidian"
  return err.message || 'Search failed'
}