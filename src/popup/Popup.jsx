import React, { useState, useCallback } from 'react'
import AppShell from './components/AppShell.jsx'
import LoginCard from './components/LoginCard.jsx'
import UpsellCard from './components/UpsellCard.jsx'
import SaveView from './views/SaveView.jsx'
import NoteView from './views/NoteView.jsx'
import SearchView from './views/SearchView.jsx'
import SettingsView from './views/SettingsView.jsx'
import useAppState from './hooks/useAppState.js'

// ── Root Popup component ──────────────────────────────────────────────────────

export default function Popup() {
  const {
    view, user, pageMeta, saveStatus, errorMessage,
    navigate, handleLoginSuccess,
    setSaving, setSaved, setDuplicate, setError, resetSaveStatus,
    setUser, setPageMeta,
  } = useAppState()

  const [showSettings, setShowSettings] = useState(false)

  const handleLogout = useCallback(() => {
    setShowSettings(false)
    setUser(null)
    setPageMeta(null)
    navigate('login')
  }, [navigate, setUser, setPageMeta])

  const toggleSettings = useCallback(() => {
    setShowSettings(s => !s)
  }, [])

  const isAuthed = !['loading', 'login'].includes(view)

  return (
    <AppShell
      activeView={view}
      onNavigate={navigate}
      user={isAuthed ? user : null}
      showSettings={showSettings}
      onToggleSettings={toggleSettings}
    >
      {/* Settings overlay */}
      {showSettings && isAuthed && (
        <SettingsView
          user={user}
          onClose={() => setShowSettings(false)}
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

          {view === 'save' && (
            <SaveView
              pageMeta={pageMeta}
              user={user}
              saveStatus={saveStatus}
              errorMessage={errorMessage}
              setSaving={setSaving}
              setSaved={setSaved}
              setDuplicate={setDuplicate}
              setError={setError}
              resetSaveStatus={resetSaveStatus}
            />
          )}

          {view === 'note' && (
            <NoteView pageMeta={pageMeta} />
          )}

          {view === 'search' && (
            <SearchView />
          )}
        </main>
      )}
    </AppShell>
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
