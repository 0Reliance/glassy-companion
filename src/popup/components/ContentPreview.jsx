import React, { useState, useEffect, useCallback } from 'react'
import { renderMarkdownToHtml, countWords, estimateReadingTime } from '../../lib/markdownRenderer.js'

/**
 * ContentPreview — renders extracted page Markdown as formatted HTML.
 *
 * Users can toggle between "Rendered" (rich HTML preview) and "Raw" (editable
 * Markdown) modes, and see word count + reading time estimates.
 */
export default function ContentPreview({ markdown, onMarkdownChange, title }) {
  const [mode, setMode] = useState('rendered') // 'rendered' | 'raw'
  const [html, setHtml] = useState('')
  const [wordCount, setWordCount] = useState(0)
  const [editableMarkdown, setEditableMarkdown] = useState(markdown || '')

  useEffect(() => {
    if (markdown) setEditableMarkdown(markdown)
  }, [markdown])

  useEffect(() => {
    if (mode === 'rendered') {
      setHtml(renderMarkdownToHtml(editableMarkdown))
    }
    setWordCount(countWords(editableMarkdown))
  }, [editableMarkdown, mode])

  const handleRawChange = useCallback((e) => {
    const val = e.target.value
    setEditableMarkdown(val)
    if (onMarkdownChange) onMarkdownChange(val)
  }, [onMarkdownChange])

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0' }}>
      {/* Header with toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'rgba(255,255,255,0.5)' }}>
            Content Preview
          </h2>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
            {wordCount} words · ~{estimateReadingTime(wordCount)} read
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => setMode('rendered')}
            style={{
              padding: '3px 8px',
              borderRadius: 6,
              border: '1px solid',
              borderColor: mode === 'rendered' ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)',
              background: mode === 'rendered' ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.02)',
              color: mode === 'rendered' ? '#a5b4fc' : 'rgba(255,255,255,0.4)',
              fontSize: 10, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            Rendered
          </button>
          <button
            onClick={() => setMode('raw')}
            style={{
              padding: '3px 8px',
              borderRadius: 6,
              border: '1px solid',
              borderColor: mode === 'raw' ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)',
              background: mode === 'raw' ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.02)',
              color: mode === 'raw' ? '#a5b4fc' : 'rgba(255,255,255,0.4)',
              fontSize: 10, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            Raw
          </button>
        </div>
      </div>

      {/* Preview area */}
      <div
        className="glass-card"
        style={{
          maxHeight: 280,
          overflowY: 'auto',
          padding: 12,
          background: 'rgba(0,0,0,0.15)',
          borderColor: 'rgba(255,255,255,0.06)',
        }}
      >
        {mode === 'rendered' ? (
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.6,
              color: 'rgba(255,255,255,0.8)',
              wordBreak: 'break-word',
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <textarea
            className="glass-input"
            value={editableMarkdown}
            onChange={handleRawChange}
            style={{
              width: '100%',
              minHeight: 240,
              fontSize: 11,
              fontFamily: "'SF Mono', 'Fira Code', monospace",
              lineHeight: 1.6,
              background: 'transparent',
              border: 'none',
              resize: 'vertical',
              color: 'rgba(255,255,255,0.75)',
            }}
            spellCheck={false}
          />
        )}
      </div>

      {/* Hint */}
      <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', textAlign: 'center', margin: 0 }}>
        {mode === 'rendered'
          ? 'Switch to Raw to edit the Markdown before saving.'
          : 'Switch to Rendered to preview the formatted output.'}
      </p>
    </div>
  )
}
