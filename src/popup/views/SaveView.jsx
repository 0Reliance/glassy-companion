import React, { useState, useCallback } from 'react'
import BookmarkCard from '../components/BookmarkCard.jsx'
import SmartSavePanel from '../components/SmartSavePanel.jsx'
import SaveToast from '../components/SaveToast.jsx'
import { saveBookmark, saveNote, saveAllTabs } from '../hooks/useExtensionBridge.js'

export default function SaveView({ pageMeta, user, ruleDefaults, alreadySaved, saveStatus, errorMessage, lastCaptureId, setSaving, setSaved, setDuplicate, setError, resetSaveStatus, setLastCaptureId }) {
  const [mode, setMode] = useState('quick') // quick | smart

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
        type={toastType}
        errorMessage={errorMessage}
        captureId={lastCaptureId}
        onDismiss={resetSaveStatus}
        onSaveAnother={resetSaveStatus}
        onUndo={undoHandler}
      />
    )
  }

  return (
    <>
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
      {mode === 'quick' ? (
        <>
          <BookmarkCard
            pageMeta={pageMeta}
            user={user}
            onSave={handleSave}
            onSaveNote={handleSaveNote}
            saving={saveStatus === 'saving'}
          />
          <button
            onClick={() => setMode('smart')}
            style={{
              marginTop: 10,
              width: '100%',
              padding: '8px 12px',
              background: 'rgba(99,102,241,0.1)',
              border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: 10,
              color: '#818cf8',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            ✨ Switch to Smart Save
          </button>
        </>
      ) : (
        <SmartSavePanel
          pageMeta={pageMeta}
          defaults={ruleDefaults}
          onSave={handleSave}
          saving={saveStatus === 'saving'}
          onCancel={() => setMode('quick')}
        />
      )}

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
