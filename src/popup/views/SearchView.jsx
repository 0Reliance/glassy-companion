import React, { useState, useEffect, useRef } from 'react'
import { searchBookmarks } from '../hooks/useExtensionBridge.js'

export default function SearchView() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const inputRef = useRef(null)

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setResults([]); setSearchError(''); return }
    setLoading(true)
    setSearchError('')
    const timer = setTimeout(async () => {
      try {
        const res = await searchBookmarks(query.trim())
        if (res?.ok) {
          setResults((res.bookmarks || []).slice(0, 12))
        } else {
          setResults([])
          setSearchError(res?.error || 'Search failed.')
        }
      } catch (err) {
        setResults([])
        setSearchError(err.message || 'Search failed.')
      } finally { setLoading(false) }
    }, 500)
    return () => clearTimeout(timer)
  }, [query])

  // Auto-focus
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Search input */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search your bookmarks…"
          className="glass-input"
          style={{ flex: 1 }}
        />
      </div>

      {/* Results */}
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '16px 0', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
            Searching…
          </div>
        )}
        {!loading && searchError && (
          <div style={{ textAlign: 'center', padding: '16px 0', color: '#fca5a5', fontSize: 12 }}>
            {searchError}
          </div>
        )}
        {!loading && !searchError && query.trim() && results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '16px 0', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
            No bookmarks found.
          </div>
        )}
        {!loading && !query.trim() && (
          <div style={{ textAlign: 'center', padding: '12px 0', color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
            Type to search your saved bookmarks
          </div>
        )}
        {!loading && results.map(bm => (
          <SearchResultItem key={bm.id} bookmark={bm} />
        ))}
      </div>
    </div>
  )
}

/**
 * The icon a saved bookmark already carries (Glassy stored the site's own favicon address
 * when it was saved), loaded by the browser from that site — never from a third party.
 * Until 2.21.4 this asked Google's favicon service, which told Google the domain of every
 * search result; the privacy policy says the extension sends nothing to anyone else.
 */
export function faviconFor(bookmark) {
  const u = bookmark && bookmark.favicon_url
  return typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null
}

function SearchResultItem({ bookmark }) {
  const domain = (() => { try { return new URL(bookmark.url).hostname.replace(/^www\./, '') } catch { return '' } })()
  const faviconUrl = faviconFor(bookmark)
  return (
    <a
      href={bookmark.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 9,
        padding: '7px 9px', borderRadius: 8,
        textDecoration: 'none', color: 'inherit',
        transition: 'background 0.12s', cursor: 'pointer',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {faviconUrl ? (
        <img src={faviconUrl} width={16} height={16} style={{ marginTop: 2, flexShrink: 0, borderRadius: 3 }} alt="" />
      ) : (
        <div style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }} />
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 13, color: 'rgba(255,255,255,0.85)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500,
        }}>{bookmark.title || domain}</div>
        <div style={{
          fontSize: 11, color: 'rgba(255,255,255,0.3)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1,
        }}>{domain}</div>
      </div>
    </a>
  )
}
