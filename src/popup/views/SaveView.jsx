import React, { useState, useCallback } from 'react'
import BookmarkCard from '../components/BookmarkCard.jsx'
import SmartSavePanel from '../components/SmartSavePanel.jsx'
import SaveToast from '../components/SaveToast.jsx'
import { saveBookmark, saveNote, saveAllTabs } from '../hooks/useExtensionBridge.js'

export default function SaveView({ pageMeta, user, saveStatus, errorMessage, setSaving, setSaved, setDuplicate, setError, resetSaveStatus }) {
  const [mode, setMode] = useState('quick') // quick | smart

  const handleSave = useCallback(async (payload) => {
    setSaving()
    try {
      const type = payload.captureMode === 'smart' ? 'SAVE_CAPTURE' : 'SAVE_BOOKMARK'
      // Use chrome.runtime.sendMessage directly if hook doesn't support it yet
      // but for now I'll assume I'll update the hook too.
      const res = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type, payload }, resolve)
      })

      if (res?.ok) {
        setSaved(payload.sourceUrl || payload.url)
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
      const res = await saveNote(payload)
      if (res?.ok) {
        setSaved(payload.source_url)
      } else {
        setError(res?.error || 'Save failed.')
      }
    } catch (err) {
      setError(err.message || 'Save failed.')
    }
  }, [setSaving, setSaved, setError])

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
    const toastType = saveStatus === 'saved' ? 'saved' : saveStatus === 'duplicate' ? 'duplicate' : 'error'
    return (
      <SaveToast
        type={toastType}
        errorMessage={errorMessage}
        onDismiss={resetSaveStatus}
        onSaveAnother={resetSaveStatus}
      />
    )
  }

  return (
    <>
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
