/**
 * KbSearchView — Knowledge Base search UI for the Glassy Companion popup.
 *
 * Uses the hybrid search API (POST /api/kb/query) to search across bookmarks,
 * notes, and vault files. Displays results grouped by source type with
 * relevance scores and source badges.
 *
 * Gated by ENABLE_KB_UI feature flag.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { searchKnowledgeBase, getKbStatus } from '../../lib/api.js'

// ── Source type config ────────────────────────────────────────────────────────

const SOURCE_TYPES = [
  { id: 'all', label: 'All', icon: '🌐' },
  { id: 'bookmarks', label: 'Bookmarks', icon: '🔖' },
  { id: 'notes', label: 'Notes', icon: '📝' },
  { id: 'vault_files', label: 'Vault', icon: '📓' },
]

const SOURCE_ROUTE_MAP = {
  bookmark: '#/keep',
  note: '#/notes',
  vault_file: '#/kb',
  document: '#/docs',
}

const SOURCE_LABELS = {
  bookmark: 'Bookmark',
  note: 'Note',
  vault_file: 'Vault',
  document: 'Doc',
}

const SOURCE_ICONS = {
  bookmark: '🔖',
  note: '📝',
  vault_file: '📓',
  document: '📄',
}

// ── Component ────────────────────────────────────────────────────────────────

export default function KbSearchView() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [activeSource, setActiveSource] = useState('all')
  const [kbStatus, setKbStatus] = useState(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const inputRef = useRef(null)

  // Fetch KB status on mount
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const status = await getKbStatus()
        if (!cancelled) setKbStatus(status)
      } catch {
        // Status check is best-effort — don't block the UI
      } finally {
        if (!cancelled) setStatusLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setSearchError('')
      return
    }

    setLoading(true)
    setSearchError('')

    const timer = setTimeout(async () => {
      try {
        const sources = activeSource === 'all'
          ? undefined
          : [activeSource]

        const res = await searchKnowledgeBase(query.trim(), {
          sources,
          limit: 15,
        })

        if (res?.results) {
          setResults(res.results)
        } else if (res?.error) {
          setResults([])
          setSearchError(res.error)
        } else {
          setResults([])
          setSearchError('Unexpected response format')
        }
      } catch (err) {
        setResults([])
        setSearchError(err.message || 'Search failed')
      } finally {
        setLoading(false)
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [query, activeSource])

  // Auto-focus on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  // Inject pulse animation style once
  useEffect(() => {
    const styleEl = document.createElement('style')
    styleEl.textContent = `@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`
    document.head.appendChild(styleEl)
    return () => { styleEl.remove() }
  }, [])

  // ── Render ────────────────────────────────────────────────────────────

  const corpusReady = kbStatus?.corpus?.totalChunks > 0
  const isSearching = loading

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Corpus status banner */}
      {!statusLoading && !corpusReady && (
        <div style={{
          padding: '8px 10px', marginBottom: 8,
          background: 'rgba(251,191,36,0.08)',
          borderRadius: 8, border: '1px solid rgba(251,191,36,0.15)',
          fontSize: 11, color: 'rgba(251,191,36,0.8)',
        }}>
          ⚠ Knowledge base is still indexing. Results may be incomplete.
        </div>
      )}

      {/* Search input */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search your knowledge base…"
          className="glass-input"
          style={{ flex: 1 }}
        />
      </div>

      {/* Source filter tabs */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 8,
        overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        {SOURCE_TYPES.map(src => {
          const active = activeSource === src.id
          return (
            <button
              key={src.id}
              onClick={() => setActiveSource(src.id)}
              style={{
                padding: '4px 10px',
                borderRadius: 12,
                border: '1px solid ' + (active ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'),
                background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
                color: active ? '#a5b4fc' : 'rgba(255,255,255,0.45)',
                fontSize: 11, fontWeight: active ? 600 : 400,
                cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ marginRight: 4 }}>{src.icon}</span>
              {src.label}
            </button>
          )
        })}
      </div>

      {/* Results */}
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        {isSearching && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
            <span style={{ animation: 'pulse 1.5s infinite' }}>Searching…</span>
          </div>
        )}

        {!isSearching && searchError && (
          <div style={{ textAlign: 'center', padding: '16px 0', color: '#fca5a5', fontSize: 12 }}>
            {searchError}
          </div>
        )}

        {!isSearching && !searchError && query.trim() && results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '16px 0', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
            No results found.
          </div>
        )}

        {!isSearching && !query.trim() && (
          <div style={{ textAlign: 'center', padding: '16px 0', color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
            Type to search your knowledge base
          </div>
        )}

        {!isSearching && results.map(hit => (
          <KbSearchResult key={`${hit.sourceType}-${hit.sourceId}`} hit={hit} />
        ))}
      </div>

      {/* Result count footer */}
      {!isSearching && results.length > 0 && (
        <div style={{
          textAlign: 'center', padding: '6px 0 2px',
          fontSize: 10, color: 'rgba(255,255,255,0.25)',
        }}>
          {results.length} result{results.length === 1 ? '' : 's'}
        </div>
      )}
    </div>
  )
}

// ── Result item ───────────────────────────────────────────────────────────────

function KbSearchResult({ hit }) {
  const sourceType = hit.sourceType || 'bookmark'
  const sourceLabel = SOURCE_LABELS[sourceType] || sourceType
  const sourceIcon = SOURCE_ICONS[sourceType] || '📄'
  const sourceRoute = SOURCE_ROUTE_MAP[sourceType] || '#/keep'

  // Truncate excerpt for display
  const excerpt = hit.excerpt || ''
  const displaySnippet = excerpt.length > 140 ? excerpt.slice(0, 140) + '…' : excerpt

  // Score visualization (0–1)
  const score = typeof hit.score === 'number' ? hit.score : null

  return (
    <a
      href={sourceRoute}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 9,
        padding: '8px 9px', borderRadius: 8,
        textDecoration: 'none', color: 'inherit',
        transition: 'background 0.12s', cursor: 'pointer',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Source icon */}
      <div style={{
        width: 20, height: 20, flexShrink: 0, marginTop: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 4, background: 'rgba(255,255,255,0.05)',
        fontSize: 11,
      }}>
        {sourceIcon}
      </div>

      {/* Content */}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.85)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {hit.title || 'Untitled'}
        </div>

        {/* Snippet */}
        {displaySnippet && (
          <div style={{
            fontSize: 11, color: 'rgba(255,255,255,0.4)',
            marginTop: 2, lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {displaySnippet}
          </div>
        )}

        {/* Meta row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginTop: 3, fontSize: 10,
        }}>
          <span style={{
            padding: '1px 5px', borderRadius: 4,
            background: 'rgba(99,102,241,0.1)', color: 'rgba(165,180,252,0.8)',
            fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
          }}>
            {sourceLabel}
          </span>
          {score !== null && (
            <span style={{ color: 'rgba(255,255,255,0.2)' }}>
              {Math.round(score * 100)}%
            </span>
          )}
        </div>
      </div>
    </a>
  )
}