/**
 * KbSearchView — Knowledge Base search UI for the Glassy Capture popup.
 *
 * Searches the library through POST /api/kb/query — on Glassy 2.63+ the one
 * search every surface uses (meaning first, lifted by the query's words) —
 * across notes, documents, bookmarks, voice and vault files. A result opens the
 * item in Glassy in a new tab.
 *
 * Gated by ENABLE_KB_UI feature flag.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { searchKnowledgeBase, getKbStatus } from '../../lib/api.js'
import { getBaseUrl } from '../../lib/auth.js'

// ── Source type config ────────────────────────────────────────────────────────

// ids are the server's source names (routes/kb.js SOURCE_TYPE_MAP). The vault
// tab used to send 'vault_files', which the server does not know, so it answered
// with everything.
export const SOURCE_TYPES = [
  { id: 'all', label: 'All', icon: '🌐' },
  { id: 'notes', label: 'Notes', icon: '📝' },
  { id: 'documents', label: 'Docs', icon: '📄' },
  { id: 'bookmarks', label: 'Bookmarks', icon: '🔖' },
  { id: 'voice', label: 'Voice', icon: '🎙️' },
  { id: 'vault', label: 'Vault', icon: '📓' },
]

// Where a result opens in Glassy: the item itself where the app has a link for it.
export function routeFor(hit) {
  const id = encodeURIComponent(String(hit.sourceId || ''))
  switch (hit.sourceType) {
    case 'note': return id ? `#/notes/${id}` : '#/notes'
    case 'document': return id ? `#/docs/${id}` : '#/docs'
    case 'bookmark': return hit.title ? `#/keep?q=${encodeURIComponent(hit.title)}` : '#/keep'
    case 'vault_file': return id ? `#/vault?file=${id}` : '#/vault'
    case 'voice_transcript': return '#/voice'
    default: return '#/kb'
  }
}

const SOURCE_LABELS = {
  bookmark: 'Bookmark',
  note: 'Note',
  vault_file: 'Vault',
  document: 'Doc',
  voice_transcript: 'Voice',
}

const SOURCE_ICONS = {
  bookmark: '🔖',
  note: '📝',
  vault_file: '📓',
  document: '📄',
  voice_transcript: '🎙️',
}

// ── Component ────────────────────────────────────────────────────────────────

export default function KbSearchView() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  // glassy-dash GH#68 in-band lane health: "text-only fallback" or "the index is
  // empty/drifted" must be VISIBLE, not a mysterious shortage of results.
  const [laneNotice, setLaneNotice] = useState(null)
  const [activeSource, setActiveSource] = useState('all')
  const [kbStatus, setKbStatus] = useState(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [kbDisabled, setKbDisabled] = useState(false)
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
    setLaneNotice(null)
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
          setLaneNotice(
            res?.diagnostics?.degraded
              ? (res.diagnostics.detail || 'Matching by meaning is paused, so these results share a word with your search. Something related but worded differently may be missing.')
              : null
          )
        } else if (res?.error) {
          setResults([])
          setSearchError(res.error)
        } else {
          setResults([])
          setSearchError('Glassy answered in a way this version of Glassy Capture doesn’t understand. Updating the extension usually fixes it.')
        }
      } catch (err) {
        setResults([])
        // Decided by status, not by the message's words: the server rewrote its
        // messages in v2.63–v2.65, and /api/kb/query answers 403 only when search
        // is turned off on that Glassy.
        if (err.status === 403) {
          setKbDisabled(true)
          setSearchError('')
        } else {
          setSearchError(err.message || 'Search didn’t answer. Check that your Glassy is reachable, then try again.')
        }
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
      {/* KB disabled banner — server returned 403 "not enabled" */}
      {kbDisabled && (
        <div style={{
          padding: '16px 14px', textAlign: 'center',
          background: 'rgba(255,255,255,0.02)',
          borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)',
          marginBottom: 8,
        }}>
          <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.4 }}>🧠</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
            Library search is off on this Glassy
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
            Whoever runs this Glassy has turned it off. Search still works in Glassy itself.
          </div>
        </div>
      )}

      {/* Corpus status banner */}
      {!statusLoading && !corpusReady && !kbDisabled && (
        <div style={{
          padding: '8px 10px', marginBottom: 8,
          background: 'rgba(251,191,36,0.08)',
          borderRadius: 8, border: '1px solid rgba(251,191,36,0.15)',
          fontSize: 11, color: 'rgba(251,191,36,0.8)',
        }}>
          Searching by words for now, so a result needs to share a word with your search.
        </div>
      )}

      {/* Search input — hidden when KB is disabled */}
      {!kbDisabled && (
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
      )}

      {/* Source filter tabs — hidden when KB is disabled */}
      {!kbDisabled && (
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
      )}

      {/* Results — hidden when KB is disabled */}
      {!kbDisabled && (
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

        {/* In-band lane health (GH#68): the server's degraded diagnostics, shown
            when the answer is text-only because the semantic lane is down or
            drifted — so "fewer results" never reads as "nothing more matched". */}
        {!isSearching && !searchError && laneNotice && (
          <div data-testid="lane-notice" style={{
            margin: '0 0 8px', padding: '8px 10px', borderRadius: 6,
            background: 'rgba(250,204,21,0.06)', color: '#fcd34d', fontSize: 11, lineHeight: 1.5,
          }}>
            ⚠️ {laneNotice}
          </div>
        )}

        {!isSearching && !searchError && query.trim() && results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '16px 0', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
            Nothing in your library matches that yet. Try fewer or different words.
          </div>
        )}

        {!isSearching && !query.trim() && (
          <div style={{ textAlign: 'center', padding: '16px 0', color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
            Search your notes, docs, bookmarks, voice and vault
          </div>
        )}

        {!isSearching && results.map(hit => (
          <KbSearchResult key={`${hit.sourceType}-${hit.sourceId}`} hit={hit} />
        ))}
      </div>
      )}

      {/* Result count footer — hidden when KB is disabled */}
      {!isSearching && !kbDisabled && results.length > 0 && (
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
  // The popup is not Glassy: a relative '#/notes' link stayed inside the popup.
  // Open the item in a new tab on the person's Glassy instead.
  const open = async (e) => {
    e.preventDefault()
    const baseUrl = await getBaseUrl()
    if (baseUrl) chrome.tabs.create({ url: `${baseUrl}/${routeFor(hit)}` })
  }

  // Truncate excerpt for display
  const excerpt = hit.excerpt || ''
  const displaySnippet = excerpt.length > 140 ? excerpt.slice(0, 140) + '…' : excerpt

  // Score visualization (0–1)
  const score = typeof hit.score === 'number' ? hit.score : null

  return (
    <a
      href={routeFor(hit)}
      onClick={open}
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
              {Math.round(score * 100)}% close
            </span>
          )}
        </div>
      </div>
    </a>
  )
}