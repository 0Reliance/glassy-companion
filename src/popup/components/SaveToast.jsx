import React, { useEffect, useRef, useState } from 'react'
import { deleteCapture } from '../hooks/useExtensionBridge.js'
import { createCalendarEvent, reminderTimes } from '../../lib/api.js'

export default function SaveToast({ type, errorMessage, onDismiss, onSaveAnother, captureId, onUndo, multiAccount = false, pageTitle = '', pageUrl = '' }) {
  const isError = type === 'error'
  const isDuplicate = type === 'duplicate'
  const isSaved = type === 'saved'
  const isQueued = type === 'queued'
  const undoRef = useRef(null)
  // "Read it later": null until the person picks a time, then 'saving', 'added' or 'error'.
  const [reminder, setReminder] = useState(null)
  const [reminderNote, setReminderNote] = useState('')

  // Auto-dismiss after 8 seconds for saved items — unless the person is setting a
  // reminder, so its confirmation stays on screen.
  useEffect(() => {
    if (!isSaved || !onDismiss || reminder) return
    const timer = setTimeout(() => {
      onDismiss()
    }, 8000)
    return () => clearTimeout(timer)
  }, [isSaved, onDismiss, reminder])

  async function remind(when) {
    setReminder('saving')
    const label = when === 'week' ? 'next week at 9:00' : 'tomorrow at 9:00'
    try {
      const title = `Read: ${(pageTitle || pageUrl || 'a saved page').trim()}`.slice(0, 500)
      await createCalendarEvent({ title, ...reminderTimes(when), ...(pageUrl ? { description: pageUrl } : {}) })
      setReminder('added')
      setReminderNote(`Added to your Glassy calendar for ${label}.`)
    } catch (err) {
      setReminder('error')
      setReminderNote(err?.status === 404
        ? 'This Glassy is too old for reminders from the extension. Updating Glassy adds them.'
        : 'The reminder wasn’t added. Try again in a moment.')
    }
  }

  async function handleUndo() {
    if (!captureId) return
    try {
      await deleteCapture(captureId)
      if (onUndo) onUndo()
    } catch {
      // silently fail — the undo is best-effort
    }
    if (onDismiss) onDismiss()
  }

  // Queued state uses amber to distinguish "will sync later" from "saved now".
  const tone = isError
    ? { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', glow: 'rgba(239,68,68,0.2)' }
    : isQueued
      ? { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', glow: 'rgba(245,158,11,0.2)' }
      : { bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', glow: 'rgba(34,197,94,0.2)' }

  return (
    <div className="animate-in" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '40px 20px', textAlign: 'center', gap: 16
    }}>
      <div className="luminous" style={{
        width: 60, height: 60, borderRadius: '50%',
        background: tone.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 32, border: '1px solid',
        borderColor: tone.border,
        boxShadow: `0 0 20px ${tone.glow}`
      }}>
        {isError ? '✕' : isDuplicate ? '📋' : isQueued ? '⏳' : '✓'}
      </div>

      <div>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
          {isError ? 'Not saved' : isDuplicate ? 'Already in Keep' : isQueued ? 'Saved on this device' : 'Saved'}
        </h3>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
          {isError ? (errorMessage || 'Glassy didn’t confirm the save, so nothing was saved. Try again in a moment.') :
           isDuplicate ? (multiAccount
             ? 'This page is already saved in the selected account. Switch accounts to save it somewhere else.'
             : 'This page was already saved to your workspace.') :
           isQueued ? 'Glassy isn\u2019t reachable right now, so this is kept on this device. It goes to Glassy on its own when the connection is back.' :
           'It’s in your Glassy.'}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, width: '100%', marginTop: 8 }}>
        <button className="btn-accent" style={{ flex: 1 }} onClick={onSaveAnother || onDismiss}>
          {isSaved ? 'Save Another' : 'Dismiss'}
        </button>
        {isSaved && captureId && (
          <button
            className="btn-ghost"
            onClick={handleUndo}
            ref={undoRef}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
          >
            ↩ Undo
          </button>
        )}
      </div>
      {isSaved && (
        <div data-testid="read-later" style={{ width: '100%', fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
          {reminder === 'added' || reminder === 'error' ? (
            <p role="status" style={{ margin: 0, color: reminder === 'added' ? 'rgba(134,239,172,0.85)' : 'rgba(252,211,77,0.9)' }}>{reminderNote}</p>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
              <span>Remind me to read it:</span>
              <button className="btn-ghost" disabled={reminder === 'saving'} onClick={() => remind('tomorrow')}>Tomorrow</button>
              <button className="btn-ghost" disabled={reminder === 'saving'} onClick={() => remind('week')}>Next week</button>
            </div>
          )}
        </div>
      )}
      {isSaved && captureId && !reminder && (
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: -4 }}>
          Closes in 8 seconds. Press ↩ to undo.
        </p>
      )}
    </div>
  )
}
