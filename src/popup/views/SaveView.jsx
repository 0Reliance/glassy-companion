import React, { useCallback } from 'react'
import BookmarkCard from '../components/BookmarkCard.jsx'
import SaveToast from '../components/SaveToast.jsx'
import { saveBookmark, saveNote, saveAllTabs } from '../hooks/useExtensionBridge.js'

export default function SaveView({ pageMeta, user, saveStatus, errorMessage, setSaving, setSaved, setDuplicate, setError, resetSaveStatus }) {

  const handleSave = useCallback(async (payload) => {
    setSaving()
    try {
      const res = await saveBookmark(payload)
      if (res?.ok) {
        setSaved(payload.url)
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

  // Show toast for saved/duplicate/error states
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
      <BookmarkCard
        pageMeta={pageMeta}
        user={user}
        onSave={handleSave}
        onSaveNote={handleSaveNote}
        saving={saveStatus === 'saving'}
      />
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
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
      >
        📋 Save all tabs in window
      </button>
    </>
  )
}
