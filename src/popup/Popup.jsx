import React, { useState, useCallback, Suspense, lazy } from 'react'
import AppShell from './components/AppShell.jsx'
import LoginCard from './components/LoginCard.jsx'
import UpsellCard from './components/UpsellCard.jsx'
import Skeleton from './components/Skeleton.jsx'
import useAppState from './hooks/useAppState.js'

// ── Code-split views ─────────────────────────────────────────────────────────
// Each view is loaded on demand so the popup's main chunk stays small
// (Chrome Web Store requires all chunks under 200 KB). The lazy() calls
// produce separate chunks: SaveView, NoteView, SearchView, KbSearchView,
// SettingsView. KbSearchView was already in the 'kb-view' manual chunk.
const SaveView = lazy(() => import('./views/SaveView.jsx'))
const NoteView = lazy(() => import('./views/NoteView.jsx'))
const SearchView = lazy(() => import('./views/SearchView.jsx'))
const KbSearchView = lazy(() => import('./views/KbSearchView.jsx'))
const SettingsView = lazy(() => import('./views/SettingsView.jsx'))

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
        <Suspense fallback={<Skeleton variant="settings" />}>
          <SettingsView
            user={user}
            onClose={() => setShowSettings(false)}
            onLogout={handleLogout}
          />
        </Suspense>
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
            <Suspense fallback={<Skeleton variant="save" />}>
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
            </Suspense>
          )}

          {view === 'note' && (
            <Suspense fallback={<Skeleton variant="note" />}>
              <NoteView pageMeta={pageMeta} />
            </Suspense>
          )}

          {view === 'search' && (
            <Suspense fallback={<Skeleton variant="search" />}>
              <SearchView />
            </Suspense>
          )}

          {view === 'kb' && (
            <Suspense fallback={<Skeleton variant="kb" />}>
              <KbSearchView />
            </Suspense>
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
