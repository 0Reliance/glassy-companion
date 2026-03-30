import React from 'react'

const TABS = [
  { id: 'save', label: 'Save', icon: '🔖' },
  { id: 'note', label: 'Note', icon: '📝' },
  { id: 'search', label: 'Search', icon: '🔍' },
]

export default function AppShell({ activeView, onNavigate, user, showSettings, onToggleSettings, children }) {
  const isContentView = ['save', 'note', 'search'].includes(activeView)

  return (
    <div className="popup-root" style={{
      width: 380, fontFamily: 'Inter, sans-serif',
      background: '#0c0c14', color: 'rgba(255,255,255,0.9)', minHeight: 200,
    }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px 0',
        background: 'rgba(255,255,255,0.03)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GlassyLogo />
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em', color: 'rgba(255,255,255,0.92)' }}>
            Glassy
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', paddingLeft: 2 }}>
            Companion
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {user && (
            <button
              onClick={onToggleSettings}
              title={user?.email || 'Settings'}
              style={{
                background: showSettings ? 'rgba(99,102,241,0.15)' : 'transparent',
                border: '1px solid',
                borderColor: showSettings ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)',
                borderRadius: 8,
                padding: '4px 7px',
                color: showSettings ? '#818cf8' : 'rgba(255,255,255,0.45)',
                cursor: 'pointer', fontSize: 16, lineHeight: 1,
                transition: 'all 0.15s',
              }}
            >
              ⚙
            </button>
          )}
        </div>
      </header>

      {/* Tab bar — only show when authenticated and not in settings */}
      {isContentView && !showSettings && (
        <nav style={{
          display: 'flex', gap: 2,
          padding: '8px 14px 0',
          background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              style={{
                flex: 1,
                padding: '7px 4px 9px',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${activeView === tab.id ? '#6366f1' : 'transparent'}`,
                color: activeView === tab.id ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
                fontSize: 12, fontWeight: activeView === tab.id ? 600 : 400,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 13 }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      )}

      {/* Separator when no tabs */}
      {(!isContentView || showSettings) && (
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)' }} />
      )}

      {/* Content */}
      {children}
    </div>
  )
}

function GlassyLogo() {
  return (
    <div style={{
      width: 22, height: 22, borderRadius: 6,
      background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, flexShrink: 0,
    }}>
      ✦
    </div>
  )
}
