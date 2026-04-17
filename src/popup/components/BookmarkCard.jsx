import React, { useState, useCallback, useEffect, useRef } from 'react'
import CollectionPicker from './CollectionPicker.jsx'
import TagEditor from './TagEditor.jsx'
import QuickActions from './QuickActions.jsx'

const BOOKMARK_DRAFT_KEY = 'glassy_bookmark_draft'

export default function BookmarkCard({ pageMeta, user, onSave, onSaveNote, saving }) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [collectionId, setCollection] = useState(null)
  const [tags, setTags] = useState([])
  const [aiTag, setAiTag] = useState(true)
  const [showNotes, setShowNotes] = useState(false)
  const [draftRestored, setDraftRestored] = useState(false)
  const draftTimer = useRef(null)

  // Effective title: edited > extracted > url
  const effectiveTitle = title || pageMeta?.title || pageMeta?.url || '(Untitled)'

  // Restore draft on mount
  useEffect(() => {
    try {
      chrome.storage.local.get(BOOKMARK_DRAFT_KEY, (result) => {
        if (chrome.runtime.lastError) return
        const draft = result?.[BOOKMARK_DRAFT_KEY]
        if (draft) {
          if (draft.title) setTitle(draft.title)
          if (draft.notes) { setNotes(draft.notes); setShowNotes(true) }
          if (Array.isArray(draft.tags) && draft.tags.length) setTags(draft.tags)
          if (draft.collectionId != null) setCollection(draft.collectionId)
          setDraftRestored(true)
          setTimeout(() => setDraftRestored(false), 2000)
        }
      })
    } catch { /* storage unavailable */ }
  }, [])

  // Auto-save draft (debounced 500ms)
  useEffect(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => {
      if (title || notes || tags.length || collectionId != null) {
        chrome.storage.local.set({
          [BOOKMARK_DRAFT_KEY]: { title, notes, tags, collectionId, savedAt: Date.now() }
        })
      }
    }, 500)
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current) }
  }, [title, notes, tags, collectionId])

  const clearDraft = useCallback(() => {
    chrome.storage.local.remove(BOOKMARK_DRAFT_KEY)
  }, [])

  // Sync title field when pageMeta first arrives (don't overwrite user edits or restored draft)
  useEffect(() => {
    if (pageMeta?.title && !title) {
      setTitle(pageMeta.title)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageMeta?.title])

  const handleSave = useCallback(() => {
    if (!pageMeta?.url) return
    clearDraft()
    onSave({
      url: pageMeta.url,
      title: title || pageMeta?.title || pageMeta?.url,
      description: pageMeta?.description || '',
      og_image: pageMeta?.og_image || '',
      favicon_url: pageMeta?.favicon_url || '',
      domain: pageMeta?.domain || '',
      notes: notes || '',
      collection_id: collectionId,
      tags: tags,
      ai_tag: aiTag,
    })
  }, [pageMeta, title, notes, collectionId, tags, aiTag, onSave, clearDraft])

  const handleSaveNote = useCallback((text) => {
    if (!pageMeta?.url || !text) return
    onSaveNote({
      content: text,
      source_url: pageMeta.url,
      source_title: pageMeta?.title || pageMeta?.url,
    })
  }, [pageMeta, onSaveNote])

  if (!pageMeta) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 16px', gap: 8 }}>
        <div className="spinner" />
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Reading page…</span>
      </div>
    )
  }

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* OG image if present */}
      {pageMeta.og_image && (
        <div style={{ borderRadius: 10, overflow: 'hidden', height: 100 }}>
          <img
            src={pageMeta.og_image}
            alt="Page preview"
            className="og-image"
            style={{ height: 100 }}
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        </div>
      )}

      {/* Site row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {pageMeta.favicon_url && (
          <img
            src={pageMeta.favicon_url}
            alt=""
            style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0 }}
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        )}
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {pageMeta.domain || new URL(pageMeta.url).hostname}
        </span>
      </div>

      {/* Title (editable) */}
      <input
        id="companion-bookmark-title"
        name="title"
        className="glass-input"
        value={title || pageMeta.title || ''}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Page title…"
        style={{ fontWeight: 600, fontSize: 13 }}
      />

      {/* Collection picker */}
      <CollectionPicker value={collectionId} onChange={setCollection} />

      {/* Tag editor */}
      <TagEditor tags={tags} onChange={setTags} aiTag={aiTag} onToggleAi={() => setAiTag(!aiTag)} />

      {/* Optional notes toggle */}
      <button
        onClick={() => setShowNotes(!showNotes)}
        style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
          fontSize: 11, cursor: 'pointer', textAlign: 'left', padding: 0,
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        <span style={{ fontSize: 13 }}>{showNotes ? '▾' : '▸'}</span>
        Add a note
      </button>
      {showNotes && (
        <textarea
          id="companion-bookmark-notes"
          name="notes"
          className="glass-input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Your thoughts…"
          rows={3}
          style={{ resize: 'vertical', minHeight: 64, fontFamily: 'inherit' }}
        />
      )}

      {/* Quick actions */}
      <QuickActions pageMeta={pageMeta} onSaveNote={handleSaveNote} />

      {/* Save button */}
      <button className="btn-accent" onClick={handleSave} disabled={saving || !pageMeta?.url}>
        {saving ? <span className="spinner" /> : '🔖'}
        {saving ? 'Saving…' : 'Save bookmark'}
      </button>
    </div>
  )
}
