import React, { useState, useEffect, useRef, useCallback } from 'react'
import { getActiveAccountId } from '../../lib/auth.js'
import { setActiveAccount } from '../hooks/useExtensionBridge.js'

/**
 * Account selector for multi-account users.
 *
 * Captures from the extension are written to whichever account is active
 * (sent as the `X-Account-Id` header). Without this control the extension was
 * pinned to the primary account, so saves "vanished" for users who worked in
 * other account profiles. This lets the user choose the destination.
 *
 * Props:
 *   - accounts: [{ id, label, color, is_primary }]
 *   - variant: 'full' (settings) | 'compact' (save bar)
 *   - onSwitched: (account) => void   — fired after a successful switch
 */
export default function AccountPicker({ accounts = [], variant = 'full', onSwitched }) {
  const [activeId, setActiveId] = useState(null)
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    getActiveAccountId()
      .then((id) => setActiveId(id || accounts.find(a => a.is_primary)?.id || accounts[0]?.id || null))
      .catch(() => {})
  }, [accounts])

  // Close the menu on outside click.
  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const handleSelect = useCallback(async (account) => {
    setOpen(false)
    if (account.id === activeId || switching) return
    setSwitching(true)
    try {
      const res = await setActiveAccount(account.id)
      if (res?.ok) {
        setActiveId(account.id)
        onSwitched?.(account)
      }
    } catch {
      // Leave the previous selection in place on failure.
    } finally {
      setSwitching(false)
    }
  }, [activeId, switching, onSwitched])

  // Don't render the control for single-account users — there's nothing to pick.
  if (!Array.isArray(accounts) || accounts.length <= 1) return null

  const active = accounts.find(a => a.id === activeId) || accounts.find(a => a.is_primary) || accounts[0]
  const compact = variant === 'compact'

  return (
    <div ref={ref} style={{ position: 'relative', ...(compact ? {} : { width: '100%' }) }}>
      {!compact && (
        <label style={{
          display: 'block', fontSize: 11, fontWeight: 600,
          color: 'rgba(255,255,255,0.45)', marginBottom: 5,
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          Saving to account
        </label>
      )}

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={switching}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: compact ? '5px 9px' : '9px 11px',
          borderRadius: compact ? 8 : 10,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.8)', cursor: switching ? 'wait' : 'pointer',
          fontSize: compact ? 11 : 12, textAlign: 'left',
        }}
      >
        <Dot color={active?.color} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {compact && <span style={{ color: 'rgba(255,255,255,0.4)' }}>Saving to </span>}
          <strong style={{ fontWeight: 600 }}>{active?.label || 'Account'}</strong>
        </span>
        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>{open ? '▲' : '▾'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
          background: '#121218', border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 10, padding: 4, boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
          maxHeight: 220, overflowY: 'auto',
        }}>
          {accounts.map((acc) => {
            const selected = acc.id === active?.id
            return (
              <button
                key={acc.id}
                type="button"
                onClick={() => handleSelect(acc)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '8px 9px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: selected ? 'rgba(99,102,241,0.16)' : 'transparent',
                  color: selected ? '#c4b5fd' : 'rgba(255,255,255,0.75)',
                  fontSize: 12, textAlign: 'left',
                }}
              >
                <Dot color={acc.color} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {acc.label}
                  {acc.is_primary && (
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginLeft: 6 }}>primary</span>
                  )}
                </span>
                {selected && <span style={{ fontSize: 11 }}>✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Dot({ color }) {
  return (
    <span style={{
      width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
      background: color || '#8B5CF6',
      boxShadow: `0 0 6px ${color || '#8B5CF6'}80`,
    }} />
  )
}
