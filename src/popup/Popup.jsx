import React, { useEffect, useReducer, useCallback, useState, useRef } from 'react'
import LoginCard from './components/LoginCard.jsx'
import UpsellCard from './components/UpsellCard.jsx'
import BookmarkCard from './components/BookmarkCard.jsx'
import SaveToast from './components/SaveToast.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'

// ── State machine ─────────────────────────────────────────────────────────────
// States: loading → login → no_entitlement → ready → saving → saved | duplicate | error
// Settings panel can overlay any authenticated state.

const INITIAL_STATE = {
  view: 'loading',      // loading | login | no_entitlement | ready | saving | saved | duplicate | error
  user: null,
  pageMeta: null,
  errorMessage: '',
  showSettings: false,
  savedBookmarkUrl: null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, view: action.view, errorMessage: action.errorMessage || '' }
    case 'SET_USER':
      return { ...state, user: action.user }
    case 'SET_PAGE_META':
      return { ...state, pageMeta: action.pageMeta }
    case 'SET_SAVING':
      return { ...state, view: 'saving' }
    case 'SET_SAVED':
      return { ...state, view: 'saved', savedBookmarkUrl: action.url }
    case 'SET_DUPLICATE':
      return { ...state, view: 'duplicate', savedBookmarkUrl: action.url }
    case 'SET_ERROR':
      return { ...state, view: 'error', errorMessage: action.message }
    case 'TOGGLE_SETTINGS':
      return { ...state, showSettings: !state.showSettings }
    case 'CLOSE_SETTINGS':
      return { ...state, showSettings: false }
    case 'RESET_READY':
      return { ...state, view: 'ready' }
    default:
      return state
  }
}

// ── Message helpers ───────────────────────────────────────────────────────────

function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError)
      resolve(response)
    })
  })
}

// ── Root Popup component ──────────────────────────────────────────────────────

export default function Popup() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchInputRef = useRef(null)

  // Debounced search
  useEffect(() => {
    if (!showSearch) return
    if (!searchQ.trim()) { setSearchResults([]); return }
    setSearchLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await sendMessage({ type: 'SEARCH_BOOKMARKS', query: searchQ.trim() })
        setSearchResults(res?.ok ? (res.bookmarks || []).slice(0, 8) : [])
      } catch { setSearchResults([]) }
      finally { setSearchLoading(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQ, showSearch])

  // Focus input when search opens
  useEffect(() => {
    if (showSearch) setTimeout(() => searchInputRef.current?.focus(), 50)
    else { setSearchQ(''); setSearchResults([]) }
  }, [showSearch])

  // On mount: check auth, then fetch page meta
  useEffect(() => {
    ;(async () => {
      try {
        const authRes = await sendMessage({ type: 'CHECK_AUTH' })
        if (!authRes?.authenticated) {
          dispatch({ type: 'SET_VIEW', view: 'login' })
          return
        }
        dispatch({ type: 'SET_USER', user: authRes.user })

        if (!authRes.user?.entitlements?.glassy_keep) {
          dispatch({ type: 'SET_VIEW', view: 'no_entitlement' })
          return
        }

        // Fetch page meta in parallel with state transition
        dispatch({ type: 'SET_VIEW', view: 'ready' })
        const metaRes = await sendMessage({ type: 'GET_ACTIVE_TAB_META' })
        if (metaRes?.meta) dispatch({ type: 'SET_PAGE_META', pageMeta: metaRes.meta })
      } catch (err) {
        console.error('[Popup] init error', err)
        dispatch({ type: 'SET_VIEW', view: 'login' })
      }
    })()
  }, [])

  const handleLoginSuccess = useCallback((user) => {
    dispatch({ type: 'SET_USER', user })
    if (!user?.entitlements?.glassy_keep) {
      dispatch({ type: 'SET_VIEW', view: 'no_entitlement' })
      return
    }
    dispatch({ type: 'SET_VIEW', view: 'ready' })
    // Fetch page meta after login
    sendMessage({ type: 'GET_ACTIVE_TAB_META' })
      .then((res) => { if (res?.meta) dispatch({ type: 'SET_PAGE_META', pageMeta: res.meta }) })
      .catch(() => {})
  }, [])

  const handleSave = useCallback(async (payload) => {
    dispatch({ type: 'SET_SAVING' })
    try {
      const res = await sendMessage({ type: 'SAVE_BOOKMARK', payload })
      if (res?.ok) {
        dispatch({ type: 'SET_SAVED', url: payload.url })
      } else if (res?.status === 409) {
        dispatch({ type: 'SET_DUPLICATE', url: payload.url })
      } else {
        dispatch({ type: 'SET_ERROR', message: res?.error || 'Save failed.' })
      }
    } catch (err) {
      dispatch({ type: 'SET_ERROR', message: err.message || 'Save failed.' })
    }
  }, [])

  const handleSaveNote = useCallback(async (payload) => {
    dispatch({ type: 'SET_SAVING' })
    try {
      const res = await sendMessage({ type: 'SAVE_NOTE', payload })
      if (res?.ok) {
        dispatch({ type: 'SET_SAVED', url: payload.source_url })
      } else {
        dispatch({ type: 'SET_ERROR', message: res?.error || 'Save failed.' })
      }
    } catch (err) {
      dispatch({ type: 'SET_ERROR', message: err.message || 'Save failed.' })
    }
  }, [])

  const handleLogout = useCallback(async () => {
    await sendMessage({ type: 'LOGOUT' }).catch(() => {})
    dispatch({ type: 'CLOSE_SETTINGS' })
    dispatch({ type: 'SET_VIEW', view: 'login' })
    dispatch({ type: 'SET_USER', user: null })
    dispatch({ type: 'SET_PAGE_META', pageMeta: null })
  }, [])

  const handleSaveAllTabs = useCallback(async () => {
    dispatch({ type: 'SET_SAVING' })
    try {
      const res = await sendMessage({ type: 'SAVE_ALL_TABS' })
      if (res?.ok) {
        dispatch({ type: 'SET_SAVED', url: `${res.saved} of ${res.total} tabs saved` })
      } else {
        dispatch({ type: 'SET_ERROR', message: res?.error || 'Save all tabs failed.' })
      }
    } catch (err) {
      dispatch({ type: 'SET_ERROR', message: err.message || 'Save all tabs failed.' })
    }
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────────

  const { view, user, pageMeta, errorMessage, showSettings } = state

  // Gear button in header (only when auth'd)
  const isAuthed = ['no_entitlement', 'ready', 'saving', 'saved', 'duplicate', 'error'].includes(view)
  const canSearch = isAuthed && ['ready', 'saving', 'saved', 'duplicate', 'error'].includes(view)

  return (
    <div className="popup-root" style={{ width: 380, fontFamily: 'Inter, sans-serif', background: '#0c0c14', color: 'rgba(255,255,255,0.9)', minHeight: 200 }}>
      {/* Header */}
      <Header
        showGear={isAuthed}
        userEmail={user?.email}
        onGearClick={() => { setShowSearch(false); dispatch({ type: 'TOGGLE_SETTINGS' }) }}
        gearActive={showSettings}
        showSearch={canSearch}
        searchActive={showSearch}
        onSearchClick={() => { dispatch({ type: 'CLOSE_SETTINGS' }); setShowSearch(s => !s) }}
      />

      {/* Settings overlay */}
      {showSettings && isAuthed && (
        <SettingsPanel
          user={user}
          onClose={() => dispatch({ type: 'CLOSE_SETTINGS' })}
          onLogout={handleLogout}
        />
      )}

      {/* Search panel */}
      {showSearch && !showSettings && (
        <SearchPanel
          searchQ={searchQ}
          onSearchChange={setSearchQ}
          results={searchResults}
          loading={searchLoading}
          inputRef={searchInputRef}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* Main content — hidden when settings or search open */}
      {!showSettings && !showSearch && (
        <main style={{ padding: '12px 14px 14px' }}>
          {view === 'loading' && <LoadingView />}

          {view === 'login' && (
            <LoginCard onLoginSuccess={handleLoginSuccess} />
          )}

          {view === 'no_entitlement' && (
            <UpsellCard user={user} />
          )}

          {(view === 'ready' || view === 'saving') && (
            <>
              <BookmarkCard
                pageMeta={pageMeta}
                user={user}
                onSave={handleSave}
                onSaveNote={handleSaveNote}
                saving={view === 'saving'}
              />
              <button
                onClick={handleSaveAllTabs}
                disabled={view === 'saving'}
                style={{
                  marginTop: 10,
                  width: '100%',
                  padding: '8px 12px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10,
                  color: 'rgba(255,255,255,0.45)',
                  fontSize: 12,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
              >
                📋 Save all tabs in window
              </button>
            </>
          )}

          {(view === 'saved' || view === 'duplicate' || view === 'error') && (
            <SaveToast
              type={view}
              errorMessage={errorMessage}
              onDismiss={() => dispatch({ type: 'RESET_READY' })}
              onSaveAnother={() => dispatch({ type: 'RESET_READY' })}
            />
          )}
        </main>
      )}
    </div>
  )
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header({ showGear, userEmail, onGearClick, gearActive, showSearch, searchActive, onSearchClick }) {
  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px 9px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(255,255,255,0.03)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <GlassyLogo />
        <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em', color: 'rgba(255,255,255,0.92)' }}>
          Glassy
        </span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', paddingLeft: 2 }}>
          Companion
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {showSearch && (
          <button
            onClick={onSearchClick}
            title="Search bookmarks"
            style={{
              background: searchActive ? 'rgba(20,184,166,0.15)' : 'transparent',
              border: '1px solid',
              borderColor: searchActive ? 'rgba(20,184,166,0.4)' : 'rgba(255,255,255,0.08)',
              borderRadius: 8,
              padding: '4px 7px',
              color: searchActive ? '#2dd4bf' : 'rgba(255,255,255,0.45)',
              cursor: 'pointer',
              fontSize: 15,
              lineHeight: 1,
              transition: 'all 0.15s',
            }}
          >
            🔍
          </button>
        )}
        {showGear && (
          <button
            onClick={onGearClick}
            title={userEmail || 'Settings'}
            style={{
              background: gearActive ? 'rgba(99,102,241,0.15)' : 'transparent',
              border: '1px solid',
              borderColor: gearActive ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)',
              borderRadius: 8,
              padding: '4px 7px',
              color: gearActive ? '#818cf8' : 'rgba(255,255,255,0.45)',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              transition: 'all 0.15s',
            }}
          >
            ⚙
          </button>
        )}
      </div>
    </header>
  )
}

// ── Search Panel ──────────────────────────────────────────────────────────────

function SearchPanel({ searchQ, onSearchChange, results, loading, inputRef, onClose }) {
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Search input */}
      <div style={{ padding: '10px 14px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="text"
          value={searchQ}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search your bookmarks…"
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            padding: '7px 11px',
            color: 'rgba(255,255,255,0.9)',
            fontSize: 13,
            outline: 'none',
          }}
        />
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255,255,255,0.3)',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: '4px',
          }}
          title="Close search"
        >✕</button>
      </div>

      {/* Results */}
      <div style={{ maxHeight: 320, overflowY: 'auto', padding: '8px 14px 12px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '16px 0', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
            Searching…
          </div>
        )}
        {!loading && searchQ.trim() && results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '16px 0', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
            No bookmarks found.
          </div>
        )}
        {!loading && !searchQ.trim() && (
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

function SearchResultItem({ bookmark }) {
  const domain = (() => { try { return new URL(bookmark.url).hostname.replace(/^www\./, '') } catch { return '' } })()
  const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=16` : null
  return (
    <a
      href={bookmark.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 9,
        padding: '7px 9px',
        borderRadius: 8,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'background 0.12s',
        cursor: 'pointer',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {faviconUrl && (
        <img src={faviconUrl} width={16} height={16} style={{ marginTop: 2, flexShrink: 0, borderRadius: 3 }} alt="" />
      )}
      {!faviconUrl && (
        <div style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }} />
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 13,
          color: 'rgba(255,255,255,0.85)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontWeight: 500,
        }}>{bookmark.title || domain}</div>
        <div style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.3)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          marginTop: 1,
        }}>{domain}</div>
      </div>
    </a>
  )
}

function GlassyLogo() {
  return (
    <div style={{
      width: 22, height: 22, borderRadius: 6,
      background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, flexShrink: 0,
    }}>
      ✦
    </div>
  )
}

function LoadingView() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', gap: 10 }}>
      <div className="spinner" style={{ width: 22, height: 22 }} />
      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading…</span>
    </div>
  )
}
