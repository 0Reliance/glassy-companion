import React, { useState, useCallback } from 'react'
import AppShell from './components/AppShell.jsx'
import LoginCard from './components/LoginCard.jsx'
import UpsellCard from './components/UpsellCard.jsx'
import SaveView from './views/SaveView.jsx'
import NoteView from './views/NoteView.jsx'
import SearchView from './views/SearchView.jsx'
import SettingsView from './views/SettingsView.jsx'
import Skeleton from './components/Skeleton.jsx'
import useAppState from './hooks/useAppState.js'

// ── Root Popup component ──────────────────────────────────────────────────────

export default function Popup() {
  const {
    view, user, pageMeta, ruleDefaults, alreadySaved, saveStatus, errorMessage, lastCaptureId,
    pendingElement, pendingScreenshot,
    navigate, handleLoginSuccess,
    setSaving, setSaved, setDuplicate, setError, resetSaveStatus, clearPending,
    setUser, setPageMeta, setLastCaptureId, setAlreadySaved,
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
              ruleDefaults={ruleDefaults}
              alreadySaved={alreadySaved}
              saveStatus={saveStatus}
              errorMessage={errorMessage}
              lastCaptureId={lastCaptureId}
              pendingElement={pendingElement}
              pendingScreenshot={pendingScreenshot}
              setSaving={setSaving}
              setSaved={setSaved}
              setDuplicate={setDuplicate}
              setError={setError}
              resetSaveStatus={resetSaveStatus}
              clearPending={clearPending}
              setLastCaptureId={setLastCaptureId}
              setAlreadySaved={setAlreadySaved}
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
    <div style={{ padding: '12px 14px 14px' }}>
      <Skeleton variant="save" />
    </div>
  )
}
