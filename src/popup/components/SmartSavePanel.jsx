import React, { useState, useCallback, useEffect } from 'react'
import CollectionPicker from './CollectionPicker.jsx'
import TagEditor from './TagEditor.jsx'
import { PRESETS, getPreset } from '../../lib/presets.js'

export default function SmartSavePanel({ pageMeta, onSave, saving, onCancel }) {
  const [title, setTitle] = useState(pageMeta?.title || '')
  const [contentType, setContentType] = useState(pageMeta?.contentType || 'bookmark')
  const [destination, setDestination] = useState(null)
  const [tags, setTags] = useState([])
  const [note, setNote] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [isPinned, setIsPinned] = useState(false)

  const handleSave = useCallback(() => {
    onSave({
      sourceUrl: pageMeta.url,
      canonicalUrl: pageMeta.canonicalUrl,
      title,
      contentType,
      captureMode: 'smart',
      status: isPublic ? 'public_candidate' : 'inbox',
      visibleTags: tags,
      note,
      projectIds: destination ? [destination] : [],
      // Pin to today/dashboard would be a system tag or status flag
      systemTags: isPinned ? ['pinned'] : [],
      siteName: pageMeta.siteName,
      author: pageMeta.author,
      publishedAt: pageMeta.publishedAt,
      coverImageUrl: pageMeta.og_image,
      favicon_url: pageMeta.favicon_url,
    })
  }, [pageMeta, title, contentType, destination, tags, note, isPublic, isPinned, onSave])

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Smart Save</h2>
        <button onClick={onCancel} className="btn-ghost" style={{ fontSize: 11 }}>Cancel</button>
      </div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {Object.values(PRESETS).map(p => (
          <button
            key={p.id}
            onClick={() => setContentType(p.id)}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid',
              borderColor: contentType === p.id ? '#6366f1' : 'rgba(255,255,255,0.08)',
              background: contentType === p.id ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.04)',
              color: contentType === p.id ? '#818cf8' : 'rgba(255,255,255,0.4)',
              fontSize: 11,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
            }}
          >
            {p.icon} {p.label}
          </button>
        ))}
      </div>

      <input
        className="glass-input"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Title"
        style={{ fontWeight: 600 }}
      />

      <CollectionPicker value={destination} onChange={setDestination} />

      <TagEditor tags={tags} onChange={setTags} />

      <textarea
        className="glass-input"
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Private note…"
        rows={3}
      />

      <div style={{ display: 'flex', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
          <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} />
          Public Candidate
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
          <input type="checkbox" checked={isPinned} onChange={e => setIsPinned(e.target.checked)} />
          Pin to Today
        </label>
      </div>

      <button className="btn-accent" onClick={handleSave} disabled={saving}>
        {saving ? <span className="spinner" /> : '✨'}
        {saving ? 'Saving…' : 'Save to Glassy'}
      </button>
    </div>
  )
}
