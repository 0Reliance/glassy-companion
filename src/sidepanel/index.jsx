/**
 * Side Panel entry point — reuses the same Popup component, but rendered
 * in a persistent side panel instead of a transient popup window.
 *
 * The side panel stays open while browsing, enabling continuous capture
 * flow without losing state between saves.
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import Popup from '../popup/Popup.jsx'
import ErrorBoundary from '../popup/components/ErrorBoundary.jsx'
import '../popup/styles/popup.css'
import '../popup/styles/a11y.css'

// Side Panel layout — wider than popup (420px vs 380px), full viewport height.
const rootEl = document.getElementById('root')
const root = createRoot(rootEl)

root.render(
  <ErrorBoundary>
    <div style={{
      '--popup-width': '100%',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#08080c',
      overflow: 'hidden',
    }}>
      <Popup />
    </div>
  </ErrorBoundary>
)
