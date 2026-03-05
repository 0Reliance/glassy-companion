import React, { useState, useRef } from 'react'

export default function TagEditor({ tags, onChange, aiTag, onToggleAi }) {
  const [input, setInput] = useState('')
  const inputRef          = useRef(null)

  function addTag(value) {
    const trimmed = value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '')
    if (!trimmed || tags.includes(trimmed) || tags.length >= 10) return
    onChange([...tags, trimmed])
  }

  function removeTag(tag) {
    onChange(tags.filter((t) => t !== tag))
  }

  function handleKeyDown(e) {
    if (['Enter', ',', ' '].includes(e.key)) {
      e.preventDefault()
      if (input.trim()) { addTag(input); setInput('') }
    } else if (e.key === 'Backspace' && !input && tags.length) {
      removeTag(tags[tags.length - 1])
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {/* Tag pills + input */}
      <div
        onClick={() => inputRef.current?.focus()}
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 5, padding: '7px 10px',
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 8, cursor: 'text', minHeight: 38,
        }}
      >
        {tags.map((tag) => (
          <span key={tag} className="tag-pill">
            {tag}
            <span className="remove" role="button" onClick={(e) => { e.stopPropagation(); removeTag(tag) }}>×</span>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (input.trim()) { addTag(input); setInput('') } }}
          placeholder={tags.length ? '' : 'Add tags… (Enter or comma)'}
          style={{
            background: 'transparent', border: 'none', outline: 'none',
            color: 'rgba(255,255,255,0.85)', fontSize: 12, flex: 1, minWidth: 80,
          }}
        />
      </div>

      {/* AI tag toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', userSelect: 'none' }}>
        <div
          onClick={onToggleAi}
          style={{
            width: 30, height: 17, borderRadius: 10, position: 'relative', flexShrink: 0,
            background: aiTag ? 'rgba(99,102,241,0.7)' : 'rgba(255,255,255,0.12)',
            transition: 'background 0.2s', cursor: 'pointer',
          }}
        >
          <div style={{
            position: 'absolute', top: 2, width: 13, height: 13, borderRadius: '50%',
            background: 'white', transition: 'left 0.2s',
            left: aiTag ? 15 : 2,
          }} />
        </div>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
          AI auto-tag {aiTag ? <span style={{ color: '#818cf8' }}>on</span> : 'off'}
        </span>
      </label>
    </div>
  )
}
