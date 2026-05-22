import React, { useEffect, useRef } from 'react'
import { deleteCapture } from '../hooks/useExtensionBridge.js'

export default function SaveToast({ type, errorMessage, onDismiss, onSaveAnother, captureId, onUndo }) {
  const isError = type === 'error'
  const isDuplicate = type === 'duplicate'
  const isSaved = type === 'saved'
  const undoRef = useRef(null)

  // Auto-dismiss after 8 seconds for saved items.
  useEffect(() => {
    if (!isSaved || !onDismiss) return
    const timer = setTimeout(() => {
      onDismiss()
    }, 8000)
    return () => clearTimeout(timer)
  }, [isSaved, onDismiss])

  async function handleUndo() {
    if (!captureId) return
    try {
      await deleteCapture(captureId)
      if (onUndo) onUndo()
    } catch {
      // silently fail — the undo is best-effort
    }
    if (onDismiss) onDismiss()
  }

  return (
    <div className="animate-in" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '40px 20px', textAlign: 'center', gap: 16
    }}>
      <div className="luminous" style={{
        width: 60, height: 60, borderRadius: '50%',
        background: isError ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 32, border: '1px solid',
        borderColor: isError ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)',
        boxShadow: isError ? '0 0 20px rgba(239,68,68,0.2)' : '0 0 20px rgba(34,197,94,0.2)'
      }}>
        {isError ? '✕' : isDuplicate ? '📋' : '✓'}
      </div>

      <div>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
          {isError ? 'Save Failed' : isDuplicate ? 'Already in Keep' : 'Saved Successfully'}
        </h3>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
          {isError ? (errorMessage || 'Something went wrong.') :
           isDuplicate ? 'This page was already saved to your workspace.' :
           'Your item has been safely stored in Glassy.'}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, width: '100%', marginTop: 8 }}>
        <button className="btn-accent" style={{ flex: 1 }} onClick={onSaveAnother || onDismiss}>
          {isSaved ? 'Save Another' : 'Dismiss'}
        </button>
        {isSaved && captureId && (
          <button
            className="btn-ghost"
            onClick={handleUndo}
            ref={undoRef}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
          >
            ↩ Undo
          </button>
        )}
      </div>
      {isSaved && captureId && (
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: -4 }}>
          Auto-dismisses in 8s. Press ↩ to undo.
        </p>
      )}
    </div>
  )
}
