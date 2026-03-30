import React, { useState, useEffect, useRef } from 'react'
import { getCollections } from '../../lib/cache.js'
import { createCollection } from '../../lib/api.js'

export default function CollectionPicker({ value, onChange }) {
  const [collections, setCollections] = useState([])
  const [loading, setLoading]         = useState(true)
  const [open, setOpen]               = useState(false)
  const [creating, setCreating]       = useState(false)
  const [newName, setNewName]         = useState('')
  const [createError, setCreateError] = useState('')
  const wrapperRef = useRef(null)
  const createInputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  useEffect(() => {
    getCollections()
      .then((list) => setCollections(list || []))
      .catch(() => setCollections([]))
      .finally(() => setLoading(false))
  }, [])

  const selected = collections.find((c) => c.id === value)
  const label    = selected ? selected.name : 'No collection'

  if (loading) {
    return (
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="spinner" style={{ width: 12, height: 12 }} />
        Loading collections…
      </div>
    )
  }

  if (!collections.length) return null

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', textAlign: 'left',
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 8, padding: '8px 12px', color: value ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)',
          fontSize: 13, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>🗂️</span>
          {label}
        </span>
        <span style={{ fontSize: 10, opacity: 0.5 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
          background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 10, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          maxHeight: 220, overflowY: 'auto',
        }}>
          {/* None option */}
          <button type="button" style={optionStyle(value === null)} onClick={() => { onChange(null); setOpen(false); setCreating(false) }}>
            <span>—</span> No collection
          </button>

          {/* Inline create */}
          {creating ? (
            <div style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <form onSubmit={async (e) => {
                e.preventDefault()
                const name = newName.trim()
                if (!name) return
                setCreateError('')
                try {
                  const created = await createCollection(name)
                  setCollections(prev => [...prev, created])
                  onChange(created.id)
                  setCreating(false)
                  setNewName('')
                  setOpen(false)
                } catch (err) {
                  setCreateError(err.message || 'Failed to create')
                }
              }} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                  ref={createInputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Collection name"
                  maxLength={50}
                  autoFocus
                  style={{
                    flex: 1, padding: '5px 8px', fontSize: 12, borderRadius: 6,
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                    color: '#fff', outline: 'none',
                  }}
                  onKeyDown={(e) => { if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
                />
                <button type="submit" style={{
                  background: 'rgba(99,102,241,0.6)', border: 'none', borderRadius: 6,
                  padding: '5px 10px', fontSize: 11, color: '#fff', cursor: 'pointer',
                }}>Add</button>
              </form>
              {createError && <div style={{ fontSize: 10, color: '#f87171', marginTop: 3 }}>{createError}</div>}
            </div>
          ) : (
            <button type="button" style={{
              ...optionStyle(false),
              color: '#818cf8', fontWeight: 500,
            }} onClick={() => setCreating(true)}>
              <span>＋</span> New collection
            </button>
          )}

          {collections.map((c) => (
            <button type="button" key={c.id} style={optionStyle(value === c.id)} onClick={() => { onChange(c.id); setOpen(false); setCreating(false) }}>
              <span>{c.emoji || '📁'}</span> {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function optionStyle(active) {
  return {
    display: 'flex', alignItems: 'center', gap: 7,
    width: '100%', textAlign: 'left', background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
    border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)',
    padding: '9px 12px', color: active ? '#a5b4fc' : 'rgba(255,255,255,0.75)',
    fontSize: 13, cursor: 'pointer',
  }
}
