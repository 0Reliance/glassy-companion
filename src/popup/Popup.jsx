import React, { useEffect, useReducer, useCallback } from 'react'
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

  // ── Render ──────────────────────────────────────────────────────────────────

  const { view, user, pageMeta, errorMessage, showSettings } = state

  // Gear button in header (only when auth'd)
  const isAuthed = ['no_entitlement', 'ready', 'saving', 'saved', 'duplicate', 'error'].includes(view)

  return (
    <div className="popup-root" style={{ width: 380, fontFamily: 'Inter, sans-serif', background: '#0c0c14', color: 'rgba(255,255,255,0.9)', minHeight: 200 }}>
      {/* Header */}
      <Header
        showGear={isAuthed}
        userEmail={user?.email}
        onGearClick={() => dispatch({ type: 'TOGGLE_SETTINGS' })}
        gearActive={showSettings}
      />

      {/* Settings overlay */}
      {showSettings && isAuthed && (
        <SettingsPanel
          user={user}
          onClose={() => dispatch({ type: 'CLOSE_SETTINGS' })}
          onLogout={handleLogout}
        />
      )}

      {/* Main content — hidden when settings open */}
      {!showSettings && (
        <main style={{ padding: '12px 14px 14px' }}>
          {view === 'loading' && <LoadingView />}

          {view === 'login' && (
            <LoginCard onLoginSuccess={handleLoginSuccess} />
          )}

          {view === 'no_entitlement' && (
            <UpsellCard user={user} />
          )}

          {(view === 'ready' || view === 'saving') && (
            <BookmarkCard
              pageMeta={pageMeta}
              user={user}
              onSave={handleSave}
              onSaveNote={handleSaveNote}
              saving={view === 'saving'}
            />
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

function Header({ showGear, userEmail, onGearClick, gearActive }) {
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
    </header>
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
