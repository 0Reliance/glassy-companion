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
  const draftTimer = useRef(null)

  useEffect(() => {
    chrome.storage.local.get(BOOKMARK_DRAFT_KEY, (result) => {
      const draft = result?.[BOOKMARK_DRAFT_KEY]
      if (draft) {
        if (draft.title) setTitle(draft.title)
        if (draft.notes) { setNotes(draft.notes); setShowNotes(true) }
        if (Array.isArray(draft.tags)) setTags(draft.tags)
        if (draft.collectionId != null) setCollection(draft.collectionId)
      }
    })
  }, [])

  useEffect(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => {
      chrome.storage.local.set({
        [BOOKMARK_DRAFT_KEY]: { title, notes, tags, collectionId, savedAt: Date.now() }
      })
    }, 500)
    return () => clearTimeout(draftTimer.current)
  }, [title, notes, tags, collectionId])

  useEffect(() => {
    if (pageMeta?.title && !title) setTitle(pageMeta.title)
  }, [pageMeta?.title])

  const handleSave = useCallback(() => {
    if (!pageMeta?.url) return
    chrome.storage.local.remove(BOOKMARK_DRAFT_KEY)
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
  }, [pageMeta, title, notes, collectionId, tags, aiTag, onSave])

  if (!pageMeta) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 16px', gap: 12 }}>
        <div className="spinner" style={{ width: 24, height: 24 }} />
        <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500 }}>Reading page content…</span>
      </div>
    )
  }

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Visual Header */}
      <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', height: 110, background: '#000' }}>
        {pageMeta.og_image ? (
          <img src={pageMeta.og_image} className="og-image" style={{ height: 110, opacity: 0.8 }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(45deg, #1e1b4b, #0f172a)' }} />
        )}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="glass-panel" style={{ width: 20, height: 20, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 2, background: 'rgba(255,255,255,0.1)' }}>
              <img src={pageMeta.favicon_url} style={{ width: 14, height: 14 }} onError={e => e.target.style.display = 'none'} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.01em' }}>
              {pageMeta.domain || 'page'}
            </span>
          </div>
        </div>
      </div>

      {/* Fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          className="glass-input"
          value={title || pageMeta.title || ''}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Page title…"
          style={{ fontWeight: 700, fontSize: 14 }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <CollectionPicker value={collectionId} onChange={setCollection} />
          <TagEditor tags={tags} onChange={setTags} aiTag={aiTag} onToggleAi={() => setAiTag(!aiTag)} />
        </div>

        {!showNotes ? (
          <button
            onClick={() => setShowNotes(true)}
            style={{
              background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)',
              borderRadius: 10, padding: '8px 12px', color: 'rgba(255,255,255,0.4)',
              fontSize: 11, cursor: 'pointer', textAlign: 'center', fontWeight: 500
            }}
          >
            + Add personal note
          </button>
        ) : (
          <textarea
            className="glass-input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What's on your mind?"
            rows={3}
            autoFocus
          />
        )}
      </div>

      <QuickActions pageMeta={pageMeta} onSaveNote={onSaveNote} />

      <button className="btn-accent" onClick={handleSave} disabled={saving || !pageMeta?.url}>
        {saving ? <span className="spinner" /> : '🔖'}
        {saving ? 'Saving…' : 'Save Bookmark'}
      </button>
    </div>
  )
}
