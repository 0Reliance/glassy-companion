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
    <svg width="24" height="24" viewBox="0 0 120 120" aria-label="Glassy" style={{ flexShrink: 0, borderRadius: 6 }}>
      <defs>
        <linearGradient id="gLogoTop" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a8b1ff" />
          <stop offset="100%" stopColor="#563b9e" />
        </linearGradient>
        <linearGradient id="gLogoLeft" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4df0ff" />
          <stop offset="100%" stopColor="#1b4b82" />
        </linearGradient>
        <linearGradient id="gLogoRight" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#d661ff" />
          <stop offset="100%" stopColor="#3a1d63" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx="26" fill="#0c0c14" />
      <polygon points="60,20 95,40 60,60 25,40" fill="url(#gLogoTop)" opacity="0.95" />
      <polygon points="25,40 60,60 60,100 25,80" fill="url(#gLogoLeft)" opacity="0.95" />
      <polygon points="95,40 95,80 60,100 60,60" fill="url(#gLogoRight)" opacity="0.95" />
      <polyline points="25,40 60,60 95,40" fill="none" stroke="#fff" strokeWidth="1.5" strokeOpacity="0.6" />
      <line x1="60" y1="60" x2="60" y2="100" stroke="#fff" strokeWidth="1.5" strokeOpacity="0.6" />
    </svg>
  )
}
