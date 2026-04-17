import React from 'react'
import { createRoot } from 'react-dom/client'
import Popup from './Popup.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './styles/popup.css'

const root = document.getElementById('root')
createRoot(root).render(
  <ErrorBoundary>
    <Popup />
  </ErrorBoundary>
)
