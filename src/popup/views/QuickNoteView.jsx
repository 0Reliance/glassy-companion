import React, { useState, useEffect, useCallback } from 'react'
import {
  getDailyNote,
  appendDailyNote,
  saveNote,
  pushNoteToVault,
  getObsidianStatus,
  ApiError,
} from '../../lib/api.js'

/**
 * QuickNoteView — Phase B: Quick Note + Daily Note.
 *
 * Two surfaces:
 *   1. "Today's Note" card — fetches the daily note, shows a preview, and a
 *      quick-append input. Append fires `POST /api/obsidian/daily/append`.
 *      This is the highest-frequency Obsidian action (daily journaling).
 *   2. "New Note" composer — title + markdown body, creates a Glassy note
 *      (`POST /api/ext/notes`) then pushes it to the vault as a .md file
 *      (`POST /api/obsidian/push`). Two-step because /push requires a noteId
 *      from the Glassy notes table; the note is stored AND pushed.
 *
 * All endpoints route through the bridge on self-host. No new server code.
 */

const DAILY_PREVIEW_CHARS = 600
const MAX_NOTE_BODY = 10_000

export default function QuickNoteView() {
  const [status, setStatus] = useState(null)
  const [tab, setTab] = useState('daily') // 'daily' | 'new'

  // ── Connection status ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    getObsidianStatus()
      .then((s) => { if (!cancelled) setStatus(s) })
      .catch(() => { if (!cancelled) setStatus({ connected: false }) })
    return () => { cancelled = true }
  }, [])

  if (status && !status.connected) {
    return (
      <div style={{ padding: '24px 8px', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>📝</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
          Obsidian not connected
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, maxWidth: 280, margin: '0 auto' }}>
          Enable the Obsidian Bridge in Settings to use quick notes and daily notes.
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: 320 }}>
      {/* Sub-tab switcher */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 12,
        background: 'rgba(255,255,255,0.02)', borderRadius: 9, padding: 3,
      }}>
        <SubTab id="daily" active={tab === 'daily'} onClick={setTab} label="📅 Today" />
        <SubTab id="new" active={tab === 'new'} onClick={setTab} label="✏ New Note" />
      </div>

      {tab === 'daily' && <DailyNoteCard />}
      {tab === 'new' && <NewNoteCard />}
    </div>
  )
}

// ── Daily Note Card ────────────────────────────────────────────────────────────

function DailyNoteCard() {
  const [daily, setDaily] = useState(null)   // { content, date, exists }
  const [loading, setLoading] = useState(true)
  const [appendText, setAppendText] = useState('')
  const [appending, setAppending] = useState(false)
  const [feedback, setFeedback] = useState(null) // { type: 'ok'|'err', msg }

  const loadDaily = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getDailyNote()
      setDaily(result)
    } catch (err) {
      setDaily({ content: null, date: new Date().toISOString().slice(0, 10), exists: false, error: humanizeError(err) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadDaily() }, [loadDaily])

  const handleAppend = useCallback(async () => {
    const text = appendText.trim()
    if (!text) return
    setAppending(true)
    setFeedback(null)
    try {
      await appendDailyNote(text)
      setAppendText('')
      setFeedback({ type: 'ok', msg: "✓ Appended to today's note" })
      // Refresh the daily note to show the new content
      setTimeout(() => loadDaily(), 500)
    } catch (err) {
      setFeedback({ type: 'err', msg: 'Failed: ' + humanizeError(err) })
    } finally {
      setAppending(false)
    }
  }, [appendText, loadDaily])

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
          {today}
        </div>
        <button
          onClick={loadDaily}
          title="Refresh"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: '2px 6px' }}
        >
          ↻
        </button>
      </div>

      {/* Daily note preview */}
      {loading ? (
        <div style={{ padding: '16px 8px', textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
          Loading today's note…
        </div>
      ) : daily?.error ? (
        <div style={{ padding: '12px', borderRadius: 9, background: 'rgba(252,165,165,0.06)', border: '1px solid rgba(252,165,165,0.15)', fontSize: 11, color: '#fca5a5', lineHeight: 1.5 }}>
          {daily.error}
        </div>
      ) : daily?.content ? (
        <div style={{
          maxHeight: 180, overflowY: 'auto', marginBottom: 12,
          padding: '10px 12px', borderRadius: 9,
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
          fontSize: 11, lineHeight: 1.6, color: 'rgba(255,255,255,0.65)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          fontFamily: "'SF Mono', 'Monaco', monospace",
        }}>
          {daily.content.slice(0, DAILY_PREVIEW_CHARS)}
          {daily.content.length > DAILY_PREVIEW_CHARS && '\n\n… (truncated — open in Obsidian to read full note)'}
        </div>
      ) : (
        <div style={{
          padding: '16px 12px', borderRadius: 9, marginBottom: 12,
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
          fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 1.5,
        }}>
          No daily note for today yet.
          <br />Your append will create it.
        </div>
      )}

      {/* Quick-append input */}
      <textarea
        value={appendText}
        onChange={(e) => setAppendText(e.target.value)}
        placeholder="Append to today's note… (Shift+Enter to append)"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); handleAppend() }
        }}
        style={{
          width: '100%', minHeight: 60, maxHeight: 120, resize: 'none',
          padding: '8px 10px', fontSize: 11, lineHeight: 1.5,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 9, color: 'rgba(255,255,255,0.85)',
          fontFamily: "'SF Mono', 'Monaco', monospace",
          outline: 'none', boxSizing: 'border-box',
        }}
        onFocus={(e) => { e.target.style.borderColor = 'rgba(99,102,241,0.3)' }}
        onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.06)' }}
      />

      <button
        onClick={handleAppend}
        disabled={appending || !appendText.trim()}
        style={{
          marginTop: 8, padding: '8px 12px', width: '100%',
          background: appending || !appendText.trim() ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: 9, color: '#818cf8', fontSize: 11, fontWeight: 600, cursor: appending || !appendText.trim() ? 'default' : 'pointer',
          opacity: appending || !appendText.trim() ? 0.5 : 1,
          transition: 'background 0.15s',
        }}
      >
        {appending ? 'Appending…' : '↵ Append to Daily Note'}
      </button>

      {feedback && (
        <div style={{
          marginTop: 8, fontSize: 10, textAlign: 'center',
          color: feedback.type === 'ok' ? '#86efac' : '#fca5a5',
        }}>
          {feedback.msg}
        </div>
      )}
    </div>
  )
}

// ── New Note Card ──────────────────────────────────────────────────────────────

function NewNoteCard() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null) // { type, msg, filename }

  const handleSave = useCallback(async () => {
    if (!body.trim()) return
    setSaving(true)
    setFeedback(null)
    try {
      // Step 1: Create a Glassy note (returns the note object with id)
      const note = await saveNote({
        content: body.trim(),
        title: title.trim() || 'Untitled Note',
        tags: ['vault'],
      })

      // Step 2: Push the note to the Obsidian vault as a .md file
      const noteId = note?.id || note?.noteId
      if (!noteId) throw new Error('Note created but no id returned — cannot push to vault')

      const pushResult = await pushNoteToVault(noteId)

      setFeedback({
        type: 'ok',
        msg: `✓ Saved to vault: ${pushResult.filename || 'note.md'}`,
      })
      setTitle('')
      setBody('')
    } catch (err) {
      setFeedback({ type: 'err', msg: 'Failed: ' + humanizeError(err) })
    } finally {
      setSaving(false)
    }
  }, [title, body])

  return (
    <div>
      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Note title…"
        maxLength={200}
        style={{
          width: '100%', padding: '8px 10px', marginBottom: 8,
          fontSize: 12, fontWeight: 600,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 9, color: 'rgba(255,255,255,0.85)', outline: 'none', boxSizing: 'border-box',
        }}
        onFocus={(e) => { e.target.style.borderColor = 'rgba(99,102,241,0.3)' }}
        onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.06)' }}
      />

      {/* Body */}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_NOTE_BODY))}
        placeholder="Write in markdown… (Shift+Enter to save to vault)"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); handleSave() }
        }}
        style={{
          width: '100%', minHeight: 160, maxHeight: 280, resize: 'none',
          padding: '10px 12px', fontSize: 11, lineHeight: 1.6,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 9, color: 'rgba(255,255,255,0.85)',
          fontFamily: "'SF Mono', 'Monaco', monospace",
          outline: 'none', boxSizing: 'border-box',
        }}
        onFocus={(e) => { e.target.style.borderColor = 'rgba(99,102,241,0.3)' }}
        onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.06)' }}
      />
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 4, textAlign: 'right' }}>
        {body.length.toLocaleString()} / {MAX_NOTE_BODY.toLocaleString()} chars
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !body.trim()}
        style={{
          marginTop: 8, padding: '8px 12px', width: '100%',
          background: saving || !body.trim() ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: 9, color: '#818cf8', fontSize: 11, fontWeight: 600,
          cursor: saving || !body.trim() ? 'default' : 'pointer',
          opacity: saving || !body.trim() ? 0.5 : 1,
          transition: 'background 0.15s',
        }}
      >
        {saving ? 'Saving…' : '↵ Save to Vault'}
      </button>

      <div style={{ marginTop: 8, fontSize: 9, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
        Creates a note in Glassy and pushes it to your vault as a .md file
      </div>

      {feedback && (
        <div style={{
          marginTop: 8, fontSize: 10, textAlign: 'center', lineHeight: 1.5,
          color: feedback.type === 'ok' ? '#86efac' : '#fca5a5',
        }}>
          {feedback.msg}
        </div>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function SubTab({ active, onClick, label, id }) {
  return (
    <button
      onClick={() => onClick(id)}
      style={{
        flex: 1, padding: '7px 8px', border: 'none', borderRadius: 7,
        background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
        color: active ? '#fff' : 'rgba(255,255,255,0.4)',
        fontSize: 11, fontWeight: active ? 600 : 500, cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  )
}

function humanizeError(err) {
  if (!err) return 'Unknown error'
  if (err.status === 400) return 'Obsidian not configured. Enable the bridge in Settings.'
  if (err.status === 404) return 'Not found in vault.'
  if (err.status === 502) return "Can't reach Obsidian. Is it running with the Local REST API plugin enabled?"
  return err.message || 'Request failed'
}