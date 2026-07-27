import React, { useState, useCallback } from 'react'
import SaveCard from '../components/SaveCard.jsx'
import SaveToast from '../components/SaveToast.jsx'
import AccountPicker from '../components/AccountPicker.jsx'
import RelatedInVaultPanel from '../components/RelatedInVaultPanel.jsx'
import { saveBookmark, saveNote, saveAllTabs, checkDuplicateUrl } from '../hooks/useExtensionBridge.js'
import { isUnsavableUrl } from '../../lib/urlUtils.js'

export default function SaveView({ pageMeta, user, ruleDefaults, alreadySaved, saveStatus, errorMessage, lastCaptureId, pendingElement, pendingScreenshot, setSaving, setSaved, setDuplicate, setError, resetSaveStatus, clearPending, setLastCaptureId, setAlreadySaved }) {
  // Live screenshot: captured in this popup session via the Screenshot button.
  // Preferred over pendingScreenshot (prior session) when both present.
  const [liveScreenshot, setLiveScreenshot] = useState(null)

  // When a screenshot is captured in the current session, stash it so
  // SaveCard auto-expands Smart + pre-loads the screenshot via the
  // effectivePendingScreenshot prop \u2014 no popup re-open needed.
  const handleScreenshotCaptured = useCallback((data) => {
    setLiveScreenshot(data)
  }, [])

  // Effective pending screenshot: live (just captured) takes priority.
  const effectivePendingScreenshot = liveScreenshot || pendingScreenshot

  // Re-check duplicate state against the newly selected account (dedup is
  // per-account on the server) so the "already saved" badge stays accurate.
  const handleAccountSwitched = useCallback(() => {
    if (!pageMeta?.url) return
    setAlreadySaved?.(false)
    checkDuplicateUrl(pageMeta.url)
      .then(res => { if (res?.saved) setAlreadySaved?.(true) })
      .catch(() => {})
  }, [pageMeta, setAlreadySaved])

  const handleSave = useCallback(async (payload) => {
    setSaving()
    try {
      // Both quick and smart modes go through the unified capture pipeline.
      // Legacy SAVE_BOOKMARK is reserved for non-capture flows (e.g. external
      // integrations); the popup never calls it directly anymore.
      const type = payload.captureMode ? 'SAVE_CAPTURE' : 'SAVE_BOOKMARK'
      const res = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type, payload }, resolve)
      })

      if (res?.ok && res?.data?.duplicate) {
        setDuplicate()
      } else if (res?.ok) {
        setSaved()
        if (res?.data?.id) setLastCaptureId?.(res.data.id)
      } else if (res?.status === 409) {
        setDuplicate()
      } else {
        setError(res?.error || 'Save failed.')
      }
    } catch (err) {
      setError(err.message || 'Save failed.')
    }
  }, [setSaving, setSaved, setDuplicate, setError])

  const handleSaveNote = useCallback(async (payload) => {
    setSaving()
    try {
      const notePayload = typeof payload === 'string'
        ? {
            content: payload.trim(),
            title: payload.trim().split('\n')[0].slice(0, 100) || 'AI summary',
            content_format: 'markdown',
            ...(pageMeta?.url ? { source_url: pageMeta.url, source_title: pageMeta.title || pageMeta.url } : {}),
          }
        : payload
      const res = await saveNote(notePayload)
      if (res?.ok) {
        setSaved(notePayload.source_url)
      } else {
        setError(res?.error || 'Save failed.')
      }
    } catch (err) {
      setError(err.message || 'Save failed.')
    }
  }, [pageMeta, setSaving, setSaved, setError])

  const handleSaveAllTabs = useCallback(async () => {
    setSaving()
    try {
      const res = await saveAllTabs()
      if (res?.ok) {
        setSaved(`${res.saved} of ${res.total} tabs saved`)
      } else {
        setError(res?.error || 'Save all tabs failed.')
      }
    } catch (err) {
      setError(err.message || 'Save all tabs failed.')
    }
  }, [setSaving, setSaved, setError])

  if (saveStatus === 'saved' || saveStatus === 'duplicate' || saveStatus === 'error') {
    const undoHandler = () => {
      resetSaveStatus()
      setLastCaptureId?.(null)
    }

    return (
      <SaveToast
        type={saveStatus}
        errorMessage={errorMessage}
        captureId={lastCaptureId}
        onDismiss={resetSaveStatus}
        onSaveAnother={resetSaveStatus}
        onUndo={undoHandler}
        multiAccount={Array.isArray(user?.accounts) && user.accounts.length > 1}
      />
    )
  }

  // Pages the server can't accept (chrome://, file://, localhost, private IPs).
  // Surface this up-front instead of letting the user hit an opaque save error.
  if (pageMeta?.url && isUnsavableUrl(pageMeta.url)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '12px 14px',
          background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)',
          borderRadius: 10, fontSize: 12, color: '#fcd34d', lineHeight: 1.5,
        }}>
          <span style={{ fontSize: 15 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>This page can't be saved</div>
            <div style={{ color: 'rgba(255,255,255,0.5)' }}>
              Glassy can only save public web pages. Local, private, and browser
              pages (like <code>localhost</code>, <code>file://</code>, and
              <code> chrome://</code>) aren't reachable from the server. Try the
              Note tab to jot something down instead.
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Account selector — make the save destination visible & switchable so
          captures don't silently land in the wrong account profile. */}
      {Array.isArray(user?.accounts) && user.accounts.length > 1 && saveStatus === 'idle' && (
        <div style={{ marginBottom: 8 }}>
          <AccountPicker accounts={user.accounts} variant="compact" onSwitched={handleAccountSwitched} />
        </div>
      )}

      {alreadySaved && saveStatus === 'idle' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', marginBottom: 8,
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
          borderRadius: 8, fontSize: 11, color: '#4ade80',
        }}>
          <span>✓</span>
          <span>This page is already in your Keep. Saving again will update it.</span>
        </div>
      )}

      {/* Pending capture banner — element picker / screenshot (prior session only; live screenshots go straight to SaveCard).
          SaveCard auto-expands Smart + pre-loads the pending capture on mount,
          so this banner is purely informational. The dismiss (✕) clears the
          pending state; the saved card already has its copy. */}
      {(pendingElement || (pendingScreenshot && !liveScreenshot)) && saveStatus === 'idle' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', marginBottom: 8,
          background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 8, fontSize: 11, color: '#a5b4fc',
        }}>
          <span>{pendingElement ? '🎯' : '📸'}</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pendingElement
              ? `Captured element: "${pendingElement.textPreview}"`
              : `Screenshot ready: ${pendingScreenshot.title}`}
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#c4b5fd', whiteSpace: 'nowrap' }}>
            Loaded ↓
          </span>
          <button
            onClick={() => clearPending?.()}
            style={{
              padding: '3px 6px', borderRadius: 6,
              background: 'transparent', border: 'none',
              color: 'rgba(255,255,255,0.3)', fontSize: 12, cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Unified SaveCard — single form with progressive disclosure.
          Smart capture controls expand inline below QuickActions; no screen
          swap, no duplicated fields. Preserves all BookmarkCard + SmartSavePanel
          smartness: draft persistence, rule pre-population, pending-capture
          pre-load, deferred screenshot upload, content-type re-fetch. */}
      <SaveCard
        pageMeta={pageMeta}
        user={user}
        saving={saveStatus === 'saving'}
        onSave={handleSave}
        onSaveNote={handleSaveNote}
        onScreenshotCaptured={handleScreenshotCaptured}
        defaults={ruleDefaults}
        pendingElement={pendingElement}
        pendingScreenshot={effectivePendingScreenshot}
        onClearPending={() => { setLiveScreenshot(null); clearPending?.() }}
      />

      {/* Phase C: Related notes in the vault for the current page.
          Collapsible, only renders when the bridge is connected. */}
      <RelatedInVaultPanel pageTitle={pageMeta?.title} />

      <button
        onClick={handleSaveAllTabs}
        disabled={saveStatus === 'saving'}
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
        }}
      >
        📋 Save all tabs in window
      </button>
    </>
  )
}
