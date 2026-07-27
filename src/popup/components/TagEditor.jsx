import React, { useState, useRef, useEffect } from 'react'
import { getTags } from '../../lib/cache.js'
import { getVaultTags, getObsidianStatus } from '../../lib/api.js'

export default function TagEditor({ tags, onChange, aiTag, onToggleAi }) {
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [allTags, setAllTags] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const inputRef = useRef(null)
  const wrapperRef = useRef(null)

  // Load all tags on mount — merge Glassy tags + vault tags (Phase D)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Fetch Glassy tags (cached) + vault tags (if bridge connected)
        const [glassyTags, bridgeStatus] = await Promise.allSettled([
          getTags(),
          getObsidianStatus(),
        ])
        if (cancelled) return
        const merged = []
        // Glassy tags come as {name, count} objects or strings
        if (glassyTags.status === 'fulfilled' && Array.isArray(glassyTags.value)) {
          glassyTags.value.forEach((t) => merged.push({ raw: t, origin: 'glassy' }))
        }
        // Vault tags come as {tag, count} objects — fetch only if bridge is connected.
        // The server's /api/obsidian/tags passes through Obsidian's /tags/ response
        // verbatim, which is a BARE ARRAY (not {tags:[...]}). Handle both shapes.
        if (bridgeStatus.status === 'fulfilled' && bridgeStatus.value?.connected) {
          try {
            const vaultTags = await getVaultTags()
            const tagList = Array.isArray(vaultTags) ? vaultTags
              : Array.isArray(vaultTags?.tags) ? vaultTags.tags
              : []
            tagList.forEach((t) => {
              // Avoid duplicates by exact string match (after normalization)
              const name = normalizeTag(t)
              if (name && !merged.some((m) => normalizeTag(m.raw) === name)) {
                merged.push({ raw: t, origin: 'vault' })
              }
            })
          } catch { /* vault tags best-effort */ }
        }
        if (!cancelled) setAllTags(merged)
      } catch {}
    })()
    return () => { cancelled = true }
  }, [])

  // Filter suggestions based on input
  useEffect(() => {
    if (!input.trim()) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }
    const filtered = allTags
      .filter(t => {
        const name = normalizeTag(t.raw)
        return name && name.includes(input.trim().toLowerCase()) && !tags.includes(name)
      })
      .slice(0, 8)
    setSuggestions(filtered)
    setShowDropdown(filtered.length > 0)
    setHighlightIdx(-1)
  }, [input, allTags, tags])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function normalizeTag(raw) {
    // Phase D: preserve / for nested Obsidian tags (type/reference) — don't strip it.
    // Handle both Glassy {name} and Obsidian {tag} object shapes.
    const str = typeof raw === 'string' ? raw : (raw.name || raw.tag || '')
    return str.trim().toLowerCase().replace(/[^a-z0-9-/_]/g, '')
  }

  function addTag(value) {
    const trimmed = normalizeTag(value)
    if (!trimmed || tags.includes(trimmed) || tags.length >= 10) return
    onChange([...tags, trimmed])
  }

  function removeTag(tag) {
    onChange(tags.filter((t) => t !== tag))
  }

  function selectSuggestion(suggestion) {
    addTag(suggestion)
    setInput('')
    setShowDropdown(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (showDropdown && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIdx(i => Math.min(i + 1, suggestions.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIdx(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' && highlightIdx >= 0) {
        e.preventDefault()
        selectSuggestion(suggestions[highlightIdx])
        return
      }
    }
    if (['Enter', ',', ' '].includes(e.key)) {
      e.preventDefault()
      if (input.trim()) { addTag(input); setInput(''); setShowDropdown(false) }
    } else if (e.key === 'Backspace' && !input && tags.length) {
      removeTag(tags[tags.length - 1])
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
    }
  }

  return (
    <div ref={wrapperRef} style={{ display: 'flex', flexDirection: 'column', gap: 7, position: 'relative' }}>
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
          onBlur={() => {
            // Delay so dropdown click can register
            setTimeout(() => {
              if (input.trim()) { addTag(input); setInput('') }
              setShowDropdown(false)
            }, 150)
          }}
          placeholder={tags.length ? '' : 'Add tags… (Enter or comma)'}
          style={{
            background: 'transparent', border: 'none', outline: 'none',
            color: 'rgba(255,255,255,0.85)', fontSize: 12, flex: 1, minWidth: 80,
          }}
        />
      </div>

      {/* Autocomplete dropdown */}
      {showDropdown && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, marginTop: 2, maxHeight: 160, overflowY: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          {suggestions.map((s, i) => {
            const name = normalizeTag(s.raw)
            const isVault = s.origin === 'vault'
            return (
              <div
                key={name}
                onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s.raw) }}
                style={{
                  padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                  color: i === highlightIdx ? '#fff' : 'rgba(255,255,255,0.7)',
                  background: i === highlightIdx ? 'rgba(99,102,241,0.3)' : 'transparent',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {isVault && <span style={{ fontSize: 9, opacity: 0.6 }}>#</span>}
                {name}
                {isVault && <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>vault</span>}
              </div>
            )
          })}
        </div>
      )}

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
