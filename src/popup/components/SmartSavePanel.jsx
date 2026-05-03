import React, { useState, useCallback } from 'react'
import CollectionPicker from './CollectionPicker.jsx'
import TagEditor from './TagEditor.jsx'
import { PRESETS } from '../../lib/presets.js'

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
      systemTags: isPinned ? ['pinned'] : [],
      siteName: pageMeta.siteName,
      author: pageMeta.author,
      publishedAt: pageMeta.publishedAt,
      coverImageUrl: pageMeta.og_image,
      favicon_url: pageMeta.favicon_url,
    })
  }, [pageMeta, title, contentType, destination, tags, note, isPublic, isPinned, onSave])

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 0' }}>
      {/* Header section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'rgba(255,255,255,0.5)' }}>
          Smart Save
        </h2>
        <button onClick={onCancel} className="btn-ghost" style={{ padding: '4px 10px', fontSize: 10 }}>Cancel</button>
      </div>

      {/* Preset grid */}
      <div className="glass-card" style={{ padding: 10, display: 'flex', gap: 6, flexWrap: 'wrap', background: 'rgba(255,255,255,0.01)' }}>
        {Object.values(PRESETS).map(p => {
          const active = contentType === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setContentType(p.id)}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid',
                borderColor: active ? 'var(--accent-light)' : 'rgba(255,255,255,0.05)',
                background: active ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.02)',
                color: active ? '#fff' : 'rgba(255,255,255,0.4)',
                fontSize: 11,
                fontWeight: active ? 600 : 500,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: active ? '0 0 12px rgba(99,102,241,0.2)' : 'none'
              }}
            >
              {p.icon} {p.label}
            </button>
          )
        })}
      </div>

      {/* Main content group */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          className="glass-input"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Give it a title…"
          style={{ fontWeight: 600, fontSize: 14 }}
        />

        <CollectionPicker value={destination} onChange={setDestination} />

        <TagEditor tags={tags} onChange={setTags} />

        <textarea
          className="glass-input"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Any personal thoughts?"
          rows={3}
          style={{ minHeight: 80, lineHeight: 1.5 }}
        />
      </div>

      {/* Toggles */}
      <div className="glass-card" style={{ padding: 12, display: 'flex', gap: 20, background: 'rgba(255,255,255,0.01)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={isPublic}
            onChange={e => setIsPublic(e.target.checked)}
            style={{ width: 14, height: 14, borderRadius: 4, accentColor: 'var(--accent)' }}
          />
          Public Candidate
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={isPinned}
            onChange={e => setIsPinned(e.target.checked)}
            style={{ width: 14, height: 14, borderRadius: 4, accentColor: 'var(--accent)' }}
          />
          Pin to Today
        </label>
      </div>

      <button className="btn-accent" onClick={handleSave} disabled={saving} style={{ marginTop: 4 }}>
        {saving ? <span className="spinner" /> : '✨'}
        {saving ? 'Saving…' : 'Save to Glassy'}
      </button>
    </div>
  )
}
