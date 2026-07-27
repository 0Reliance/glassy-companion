import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  listVault,
  readVaultFile,
  renderVaultFile,
  openInObsidian,
  getObsidianStatus,
  ApiError,
} from '../../lib/api.js'
import QuickNoteView from './QuickNoteView.jsx'

/**
 * VaultBrowserView — Phase A: browse the Obsidian vault from the extension popup.
 *
 * Uses server endpoints (all routed through the bridge on self-host):
 *   GET /api/obsidian/vault[/:path]     → directory listing ({type, files:[]})
 *   GET /api/obsidian/vault-file/*?meta → file content + backlinks/tags/frontmatter
 *   GET /api/obsidian/render/*          → rendered HTML for the preview pane
 *   POST /api/obsidian/open             → open in the Obsidian desktop app
 *
 * The popup is 380px wide. This view is a navigator, not a full reader:
 *   - File tree with breadcrumb navigation
 *   - File preview (rendered HTML, scrollable) + metadata panel (backlinks/tags)
 *   - "Open in Obsidian" button for deep reading
 *
 * No new server code, no new permissions. The bridge (beta.9) makes it reliable.
 */

const MAX_PREVIEW_BYTES = 200_000 // cap rendered HTML we keep in memory

export default function VaultBrowserView() {
  const [status, setStatus] = useState(null)        // bridge/plugin connection
  const [subTab, setSubTab] = useState('browse')    // 'browse' | 'notes' (Phase B)
  const [currentPath, setCurrentPath] = useState('')  // vault-relative folder path
  const [selectedFile, setSelectedFile] = useState(null) // vault-relative file path
  const [listing, setListing] = useState(null)       // { type, files: [] }
  const [fileContent, setFileContent] = useState(null) // { path, content, meta } from /vault-file
  const [renderedHtml, setRenderedHtml] = useState(null)
  const [loading, setLoading] = useState('init')     // init | listing | file | null
  const [error, setError] = useState(null)           // { kind, message }

  // ── Connection status (one-time, best-effort) ──────────────────────────────
  useEffect(() => {
    let cancelled = false
    getObsidianStatus()
      .then((s) => { if (!cancelled) setStatus(s) })
      .catch(() => { if (!cancelled) setStatus({ connected: false }) })
    return () => { cancelled = true }
  }, [])

  // ── Load directory listing when path changes ───────────────────────────────
  const loadListing = useCallback(async (path) => {
    setLoading('listing')
    setError(null)
    try {
      const result = await listVault(path)
      if (result.type === 'directory') {
        setListing(result)
        setFileContent(null)
        setRenderedHtml(null)
      } else {
        // The root sometimes resolves to a file if the vault has a single root note
        setListing({ type: 'directory', path, files: [] })
      }
    } catch (err) {
      setError({ kind: 'listing', message: humanizeError(err) })
      setListing(null)
    } finally {
      setLoading(null)
    }
  }, [])

  // ── Load directory listing when path changes ───────────────────────────────
  // Gate on bridge connection — don't fire loadListing until we know the
  // bridge is connected (status === null means the status check is still in
  // flight; loading the listing prematurely would show a confusing error
  // instead of the clean "not connected" empty state).
  useEffect(() => {
    if (status === null) return // still checking connection — wait
    if (!status?.connected) return // not connected — the empty state handles it
    loadListing(currentPath)
  }, [currentPath, status, loadListing])

  // ── Load file content + rendered HTML when a file is selected ─────────────
  useEffect(() => {
    if (!selectedFile) return
    let cancelled = false
    setLoading('file')
    setError(null)
    setFileContent(null)
    setRenderedHtml(null)

    ;(async () => {
      try {
        // Fire both requests in parallel: content+meta, and rendered HTML
        const [file, rendered] = await Promise.allSettled([
          readVaultFile(selectedFile, true),
          renderVaultFile(selectedFile),
        ])
        if (cancelled) return
        if (file.status === 'fulfilled') {
          setFileContent(file.value)
        } else {
          // Render failing is non-fatal; content failing is.
          if (file.reason instanceof ApiError || file.reason?.status) {
            setError({ kind: 'file', message: humanizeError(file.reason) })
            setLoading(null)
            return
          }
        }
        if (rendered.status === 'fulfilled' && rendered.value?.html) {
          const html = rendered.value.html
          setRenderedHtml(html.length > MAX_PREVIEW_BYTES ? html.slice(0, MAX_PREVIEW_BYTES) + '\n<!-- truncated -->' : html)
        }
      } catch (err) {
        if (!cancelled) setError({ kind: 'file', message: humanizeError(err) })
      } finally {
        if (!cancelled) setLoading(null)
      }
    })()

    return () => { cancelled = true }
  }, [selectedFile])

  // ── Navigation handlers ────────────────────────────────────────────────────
  const handleItemClick = useCallback((item) => {
    // Folders end with '/'; the Obsidian REST API convention.
    const isFolder = item.endsWith('/')
    if (isFolder) {
      const folderName = item.replace(/\/$/, '')
      const next = currentPath ? `${currentPath}/${folderName}` : folderName
      setCurrentPath(next)
      setSelectedFile(null)
    } else {
      const filePath = currentPath ? `${currentPath}/${item}` : item
      setSelectedFile(filePath)
    }
  }, [currentPath])

  const goUp = useCallback(() => {
    if (!currentPath) return
    const segments = currentPath.split('/').filter(Boolean)
    segments.pop()
    setCurrentPath(segments.join('/'))
    setSelectedFile(null)
  }, [currentPath])

  const handleOpenInObsidian = useCallback(async () => {
    if (!selectedFile) return
    try {
      await openInObsidian(selectedFile)
    } catch (err) {
      setError({ kind: 'open', message: 'Could not open in Obsidian: ' + humanizeError(err) })
    }
  }, [selectedFile])

  // ── Sort: folders first, then files, alphabetical ───────────────────────────
  const sortedItems = useMemo(() => {
    if (!listing?.files) return []
    const items = Array.isArray(listing.files) ? listing.files : []
    const folders = items.filter((f) => f.endsWith('/')).sort()
    const files = items.filter((f) => !f.endsWith('/')).sort()
    return [...folders, ...files]
  }, [listing])

  // ── Render ──────────────────────────────────────────────────────────────────

  // Not connected
  if (status && !status.connected) {
    return (
      <div style={{ padding: '24px 8px', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>📁</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
          Obsidian not connected
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, maxWidth: 280, margin: '0 auto' }}>
          Enable the Obsidian Bridge in Settings to browse your vault.
          The bridge connects the Glassy server to Obsidian running on your machine.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 320 }}>
      {/* Sub-tab switcher — Browse (Phase A) / Notes (Phase B) */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 10,
        background: 'rgba(255,255,255,0.02)', borderRadius: 9, padding: 3,
      }}>
        <button
          onClick={() => setSubTab('browse')}
          style={{
            flex: 1, padding: '7px 8px', border: 'none', borderRadius: 7,
            background: subTab === 'browse' ? 'rgba(255,255,255,0.06)' : 'transparent',
            color: subTab === 'browse' ? '#fff' : 'rgba(255,255,255,0.4)',
            fontSize: 11, fontWeight: subTab === 'browse' ? 600 : 500, cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          📁 Browse
        </button>
        <button
          onClick={() => setSubTab('notes')}
          style={{
            flex: 1, padding: '7px 8px', border: 'none', borderRadius: 7,
            background: subTab === 'notes' ? 'rgba(255,255,255,0.06)' : 'transparent',
            color: subTab === 'notes' ? '#fff' : 'rgba(255,255,255,0.4)',
            fontSize: 11, fontWeight: subTab === 'notes' ? 600 : 500, cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          📝 Notes
        </button>
      </div>

      {/* Phase B: Quick Note + Daily Note */}
      {subTab === 'notes' && <QuickNoteView />}

      {/* Phase A: Vault Browser */}
      {subTab === 'browse' && (
        <>
      {/* Breadcrumb / back */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 2px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        marginBottom: 8,
      }}>
        {currentPath && (
          <button
            onClick={goUp}
            title="Back"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.5)', fontSize: 14, padding: '2px 4px',
            }}
          >
            ←
          </button>
        )}
        <Breadcrumbs path={currentPath} onNavigate={(p) => { setCurrentPath(p); setSelectedFile(null) }} />
      </div>

      {/* File tree (always visible when no file selected) */}
      {!selectedFile && (
        <div style={{ flex: 1, maxHeight: 360, overflowY: 'auto' }}>
          {loading === 'listing' && <LoadingRow label="Loading vault…" />}
          {error && error.kind === 'listing' && <ErrorRow message={error.message} />}
          {listing && !error && sortedItems.length === 0 && (
            <div style={{ padding: '20px 8px', textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>
              {currentPath ? 'Empty folder' : 'Vault is empty'}
            </div>
          )}
          {sortedItems.map((item) => {
            const isFolder = item.endsWith('/')
            const displayName = item.replace(/\/$/, '')
            return (
              <button
                key={item}
                onClick={() => handleItemClick(item)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '7px 8px', background: 'transparent', border: 'none',
                  borderRadius: 7, cursor: 'pointer', textAlign: 'left',
                  color: 'rgba(255,255,255,0.8)', fontSize: 12,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontSize: 13, opacity: isFolder ? 0.9 : 0.5, width: 16, textAlign: 'center' }}>
                  {isFolder ? '📁' : getFileIcon(displayName)}
                </span>
                <span style={{
                  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontWeight: isFolder ? 500 : 400,
                }}>
                  {displayName}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* File preview */}
      {selectedFile && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {/* File header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '4px 2px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 8,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0,
              fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              <span style={{ opacity: 0.5 }}>{getFileIcon(selectedFile)}</span>
              {selectedFile.split('/').pop()}
            </div>
            <button
              onClick={() => setSelectedFile(null)}
              title="Back to list"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.4)', fontSize: 14, padding: '2px 6px',
              }}
            >
              ✕
            </button>
          </div>

          {loading === 'file' && <LoadingRow label="Reading note…" />}
          {error && error.kind === 'file' && <ErrorRow message={error.message} />}

          {/* Metadata chips (backlinks / tags) */}
          {fileContent?.meta && (fileContent.meta.backlinks?.length > 0 || fileContent.meta.tags?.length > 0) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {fileContent.meta.backlinks?.length > 0 && (
                <Chip label={`← ${fileContent.meta.backlinks.length} backlink${fileContent.meta.backlinks.length === 1 ? '' : 's'}`} />
              )}
              {fileContent.meta.tags?.map((t, i) => (
                <Chip key={i} label={typeof t === 'string' ? t : t.tag || t.name || ''} muted />
              ))}
            </div>
          )}

          {/* Rendered preview (scrollable) or raw markdown fallback */}
          {renderedHtml && (
            <div
              style={{
                flex: 1, overflowY: 'auto', padding: '4px 2px', fontSize: 11, lineHeight: 1.6,
                color: 'rgba(255,255,255,0.75)',
              }}
              className="vault-preview"
              // The server returns sanitized HTML via renderObsidianMarkdown.
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          )}
          {!renderedHtml && fileContent?.content && !loading && (
            <pre style={{
              flex: 1, overflowY: 'auto', margin: 0, padding: '4px 2px',
              fontSize: 10, lineHeight: 1.5, color: 'rgba(255,255,255,0.6)',
              fontFamily: "'SF Mono', 'Monaco', monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {fileContent.content.slice(0, 4000)}
              {fileContent.content.length > 4000 && '\n\n… (truncated — open in Obsidian to read full note)'}
            </pre>
          )}

          {/* Open in Obsidian button */}
          {fileContent && (
            <button
              onClick={handleOpenInObsidian}
              style={{
                marginTop: 10, padding: '8px 12px', width: '100%',
                background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
                borderRadius: 9, color: '#818cf8', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.2)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)' }}
            >
              ↗ Open in Obsidian
            </button>
          )}
        </div>
      )}
        </>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function Breadcrumbs({ path, onNavigate }) {
  if (!path) {
    return <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>Vault</span>
  }
  const segments = path.split('/').filter(Boolean)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, overflow: 'hidden', flex: 1, minWidth: 0 }}>
      <button
        onClick={() => onNavigate('')}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 500, padding: '2px 0',
        }}
      >
        Vault
      </button>
      {segments.map((seg, i) => {
        const subPath = segments.slice(0, i + 1).join('/')
        const isLast = i === segments.length - 1
        return (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
            <span style={{ color: 'rgba(255,255,255,0.25)' }}>/</span>
            {isLast ? (
              <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {seg}
              </span>
            ) : (
              <button
                onClick={() => onNavigate(subPath)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.5)', fontSize: 11, padding: '2px 0',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {seg}
              </button>
            )}
          </span>
        )
      })}
    </div>
  )
}

function Chip({ label, muted }) {
  return (
    <span style={{
      padding: '2px 7px', borderRadius: 6, fontSize: 10, fontWeight: 500,
      background: muted ? 'rgba(255,255,255,0.04)' : 'rgba(99,102,241,0.1)',
      color: muted ? 'rgba(255,255,255,0.5)' : '#818cf8',
      border: `1px solid ${muted ? 'rgba(255,255,255,0.06)' : 'rgba(99,102,241,0.2)'}`,
    }}>
      {label}
    </span>
  )
}

function LoadingRow({ label }) {
  return (
    <div style={{ padding: '16px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{label || 'Loading…'}</div>
    </div>
  )
}

function ErrorRow({ message }) {
  return (
    <div style={{ padding: '12px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#fca5a5', lineHeight: 1.5 }}>{message}</div>
    </div>
  )
}

function getFileIcon(name) {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'md' || ext === 'txt') return '📄'
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return '🖼'
  if (['pdf'].includes(ext)) return '📕'
  return '📄'
}

function humanizeError(err) {
  if (!err) return 'Unknown error'
  if (err.status === 400) return 'Obsidian not configured. Enable the bridge in Settings.'
  if (err.status === 404) return 'Not found in vault.'
  if (err.status === 502) return "Can't reach Obsidian. Is it running with the Local REST API plugin enabled?"
  return err.message || 'Request failed'
}