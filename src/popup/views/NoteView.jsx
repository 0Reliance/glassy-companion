import React, { useState, useEffect, useRef, useCallback } from 'react'
import CollectionPicker from '../components/CollectionPicker.jsx'
import TagEditor from '../components/TagEditor.jsx'
import { saveNote } from '../hooks/useExtensionBridge.js'

const DRAFT_KEY = 'glassy_note_draft'
const MAX_CONTENT = 10000

export default function NoteView({ pageMeta }) {
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState([])
  const [aiTag, setAiTag] = useState(true)
  const [collectionId, setCollection] = useState(null)
  const [linkPage, setLinkPage] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [draftRestored, setDraftRestored] = useState(false)
  const textareaRef = useRef(null)
  const draftTimer = useRef(null)

  // Restore draft on mount
  useEffect(() => {
    try {
      chrome.storage.local.get(DRAFT_KEY, (result) => {
        if (chrome.runtime.lastError) return
        const draft = result?.[DRAFT_KEY]
        if (draft) {
          if (draft.content) setContent(draft.content)
          if (draft.title) setTitle(draft.title)
          if (Array.isArray(draft.tags) && draft.tags.length) setTags(draft.tags)
          if (draft.collectionId) setCollection(draft.collectionId)
          setDraftRestored(true)
          setTimeout(() => setDraftRestored(false), 2000)
        }
      })
    } catch {}
    // Focus textarea
    setTimeout(() => textareaRef.current?.focus(), 100)
  }, [])

  // Auto-save draft (debounced 500ms)
  useEffect(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => {
      if (content || title) {
        chrome.storage.local.set({
          [DRAFT_KEY]: { content, title, tags, collectionId, savedAt: Date.now() }
        })
      }
    }, 500)
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current) }
  }, [content, title, tags, collectionId])

  const clearDraft = useCallback(() => {
    chrome.storage.local.remove(DRAFT_KEY)
  }, [])

  const handleSave = useCallback(async () => {
    if (!content.trim()) return
    setSaving(true)
    setError('')
    try {
      const payload = {
        content: content.trim(),
        title: title.trim() || content.trim().split('\n')[0].slice(0, 100),
        tags: tags,
        collection_id: collectionId,
        content_format: 'markdown',
      }
      // Attach page context if toggled on
      if (linkPage && pageMeta?.url) {
        payload.source_url = pageMeta.url
        payload.source_title = pageMeta.title || pageMeta.url
      }
      const res = await saveNote(payload)
      if (res?.ok) {
        setSaved(true)
        clearDraft()
        // Reset after showing success briefly
        setTimeout(() => {
          setContent('')
          setTitle('')
          setTags([])
          setCollection(null)
          setSaved(false)
        }, 2000)
      } else {
        setError(res?.error || 'Save failed.')
      }
    } catch (err) {
      setError(err.message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }, [content, title, tags, collectionId, linkPage, pageMeta, clearDraft])

  // Keyboard shortcut: Ctrl/Cmd+Enter to save
  const handleKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
  }, [handleSave])

  const charCount = content.length
  const domain = pageMeta?.domain || (() => { try { return new URL(pageMeta?.url).hostname } catch { return '' } })()

  if (saved) {
    return (
      <div className="animate-in" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '32px 16px', gap: 12, textAlign: 'center',
      }}>
        <div style={{ fontSize: 36 }}>📝</div>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#86efac' }}>Note saved!</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
          Your note has been saved to Glassy Keep.
        </div>
      </div>
    )
  }

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Draft indicator */}
      {draftRestored && (
        <div style={{
          fontSize: 11, color: 'rgba(99,102,241,0.8)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <span>↩</span> Draft restored
        </div>
      )}

      {/* Title (optional) */}
      <input
        className="glass-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        style={{ fontWeight: 600, fontSize: 13 }}
      />

      {/* Main textarea */}
      <textarea
        ref={textareaRef}
        className="glass-input"
        value={content}
        onChange={(e) => setContent(e.target.value.slice(0, MAX_CONTENT))}
        onKeyDown={handleKeyDown}
        placeholder="Capture a note... Markdown and pasted links are preserved."
        rows={6}
        style={{
          resize: 'vertical', minHeight: 120, maxHeight: 280,
          fontFamily: 'inherit', lineHeight: 1.6, fontSize: 13,
        }}
      />

      {/* Character count */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 11, color: 'rgba(255,255,255,0.3)',
      }}>
        <span>{charCount > 0 ? `${charCount.toLocaleString()} chars` : ''}</span>
        <span style={{ color: 'rgba(255,255,255,0.2)' }}>Markdown supported • ⌘+Enter to save</span>
      </div>

      {/* Link to current page toggle */}
      {pageMeta?.url && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 10px',
            background: linkPage ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${linkPage ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: 8,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onClick={() => setLinkPage(!linkPage)}
        >
          <div style={{
            width: 30, height: 17, borderRadius: 10, position: 'relative', flexShrink: 0,
            background: linkPage ? 'rgba(99,102,241,0.7)' : 'rgba(255,255,255,0.12)',
            transition: 'background 0.2s',
          }}>
            <div style={{
              position: 'absolute', top: 2, width: 13, height: 13, borderRadius: '50%',
              background: 'white', transition: 'left 0.2s',
              left: linkPage ? 15 : 2,
            }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Link to current page</div>
            {linkPage && domain && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4, marginTop: 2,
                fontSize: 11, color: 'rgba(255,255,255,0.35)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {pageMeta?.favicon_url && (
                  <img src={pageMeta.favicon_url} alt="" style={{ width: 12, height: 12, borderRadius: 2 }}
                    onError={(e) => { e.currentTarget.style.display = 'none' }} />
                )}
                <span>{domain}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Collection picker */}
      <CollectionPicker value={collectionId} onChange={setCollection} />

      {/* Tags */}
      <TagEditor tags={tags} onChange={setTags} aiTag={aiTag} onToggleAi={() => setAiTag(!aiTag)} />

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 8, padding: '8px 12px',
          fontSize: 12, color: '#fca5a5',
        }}>
          {error}
        </div>
      )}

      {/* Save button */}
      <button
        className="btn-accent"
        onClick={handleSave}
        disabled={saving || !content.trim()}
      >
        {saving ? <span className="spinner" /> : '📝'}
        {saving ? 'Saving…' : 'Save note'}
      </button>
    </div>
  )
}
