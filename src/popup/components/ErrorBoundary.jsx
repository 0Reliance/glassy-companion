import React from 'react'

/**
 * Top-level error boundary — catches unhandled render errors in the popup
 * and shows a plain fallback so the extension never goes blank.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Something went wrong.' }
  }

  componentDidCatch(error, info) {
    console.error('[Glassy] Popup render error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: '24px 20px',
            textAlign: 'center',
            color: 'rgba(255,255,255,0.85)',
            fontFamily: 'system-ui, sans-serif',
          }}
          role="alert"
        >
          <p style={{ marginBottom: 8, fontSize: 15 }}>Something went wrong.</p>
          <p style={{ marginBottom: 16, fontSize: 12, opacity: 0.6 }}>{this.state.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '' })}
            style={{
              padding: '6px 16px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.1)',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
