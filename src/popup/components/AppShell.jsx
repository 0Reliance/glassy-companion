import React from 'react'

const TABS = [
  { id: 'save', label: 'Save', icon: '🔖' },
  { id: 'note', label: 'Note', icon: '📝' },
  { id: 'search', label: 'Search', icon: '🔍' },
  { id: 'kb', label: 'KB', icon: '🧠' },
]

export default function AppShell({ activeView, onNavigate, user, showSettings, onToggleSettings, children }) {
  const isContentView = ['save', 'note', 'search', 'kb'].includes(activeView)

  return (
    <div className="popup-root" style={{
      width: 'var(--popup-width, 380px)', fontFamily: "'Inter', sans-serif",
      background: '#08080c', color: 'rgba(255,255,255,0.95)', minHeight: 200,
      position: 'relative', overflow: 'hidden'
    }}>
      {/* Background radial glow */}
      <div style={{
        position: 'absolute', top: -100, right: -50, width: 200, height: 200,
        background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        background: 'rgba(255,255,255,0.02)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GlassyLogo />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: '-0.02em', color: '#fff', lineHeight: 1 }}>
              Glassy
            </span>
            <span style={{ fontSize: 9, fontWeight: 500, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Companion
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {user && (
            <button
              onClick={onToggleSettings}
              title={user?.email || 'Settings'}
              className="glass-card"
              style={{
                background: showSettings ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)',
                borderColor: showSettings ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)',
                padding: '6px 8px',
                color: showSettings ? '#818cf8' : 'rgba(255,255,255,0.4)',
                cursor: 'pointer', fontSize: 14, lineHeight: 1,
              }}
            >
              {showSettings ? '✕' : '⚙'}
            </button>
          )}
        </div>
      </header>

      {/* Tab bar */}
      {isContentView && !showSettings && (
        <nav style={{
          display: 'flex', gap: 4,
          padding: '8px 16px 0',
          background: 'rgba(255,255,255,0.01)',
        }}>
          {TABS.map(tab => {
            const active = activeView === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onNavigate(tab.id)}
                style={{
                  flex: 1,
                  padding: '10px 4px',
                  background: active ? 'rgba(255,255,255,0.04)' : 'transparent',
                  border: 'none',
                  borderRadius: '10px 10px 0 0',
                  color: active ? '#fff' : 'rgba(255,255,255,0.4)',
                  fontSize: 11, fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative'
                }}
              >
                <span style={{ fontSize: 14, opacity: active ? 1 : 0.6 }}>{tab.icon}</span>
                {tab.label}
                {active && (
                  <div style={{
                    position: 'absolute', bottom: 0, left: '20%', right: '20%',
                    height: 2, background: 'var(--accent)', borderRadius: '2px 2px 0 0',
                    boxShadow: '0 0 8px var(--accent)'
                  }} />
                )}
              </button>
            )
          })}
        </nav>
      )}

      {/* Main body wrapper */}
      <div style={{
        borderTop: isContentView && !showSettings ? '1px solid rgba(255,255,255,0.06)' : 'none',
      }}>
        {children}
      </div>
    </div>
  )
}

function GlassyLogo() {
  return (
    <div className="luminous" style={{
      width: 24, height: 24, borderRadius: 7,
      background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, flexShrink: 0, color: '#fff',
      boxShadow: '0 0 15px rgba(99,102,241,0.4)'
    }}>
      ✦
    </div>
  )
}
