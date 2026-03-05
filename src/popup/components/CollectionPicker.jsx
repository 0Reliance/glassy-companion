import React, { useState, useEffect, useRef } from 'react'
import { getCollections } from '../../lib/cache.js'

export default function CollectionPicker({ value, onChange }) {
  const [collections, setCollections] = useState([])
  const [loading, setLoading]         = useState(true)
  const [open, setOpen]               = useState(false)
  const wrapperRef = useRef(null)

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
          maxHeight: 180, overflowY: 'auto',
        }}>
          {/* None option */}
          <button type="button" style={optionStyle(value === null)} onClick={() => { onChange(null); setOpen(false) }}>
            <span>—</span> No collection
          </button>
          {collections.map((c) => (
            <button type="button" key={c.id} style={optionStyle(value === c.id)} onClick={() => { onChange(c.id); setOpen(false) }}>
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
