import React, { useState, useCallback, useEffect, useRef } from 'react'
import { getSettings } from '../../lib/cache.js'
import { BOOKMARK_DRAFT_KEY, draftFor, withDraft, withoutDraft } from '../../lib/saveDrafts.js'
import { holdPage, releasePage } from '../hooks/useAppState.js'

// One storage write at a time, so a draft written as the form closes and one written as the
// next page's form opens cannot overwrite each other.
let draftChain = Promise.resolve()
function updateDrafts(change) {
  draftChain = draftChain.then(() => new Promise(resolve => {
    try {
      chrome.storage.local.get(BOOKMARK_DRAFT_KEY, (result) => {
        try {
          const next = change(result?.[BOOKMARK_DRAFT_KEY])
          if (next) chrome.storage.local.set({ [BOOKMARK_DRAFT_KEY]: next }, () => resolve())
          else chrome.storage.local.remove(BOOKMARK_DRAFT_KEY, () => resolve())
        } catch { resolve() }
      })
    } catch { resolve() }
  }))
  return draftChain
}
import CollectionPicker from './CollectionPicker.jsx'
import TagEditor from './TagEditor.jsx'
import ContentPreview from './ContentPreview.jsx'
import QuickActions from './QuickActions.jsx'
import { PRESETS } from '../../lib/presets.js'
import { uploadCaptureImage } from '../../lib/api.js'

// Draft storage key — kept identical to the legacy BookmarkCard so existing
// drafts restore seamlessly after the upgrade. The shape is unchanged:
// { title, notes, tags, collectionId, url, savedAt, contentType, isPublic, isPinned, aiAutoTag, smartExpanded }

/**
 * SaveCard — unified capture card with progressive disclosure.
 *
 * Replaces the legacy two-screen Quick Save (BookmarkCard) + Smart Save
 * (SmartSavePanel) flow with a single form. The essentials (title, collection,
 * tags, note, QuickActions, Save button) are always visible. Smart controls
 * (preset type chips, public/pin toggles, content preview) appear inline below
 * the Save button when the user taps the "⚙ Smart capture" toggle pill.
 *
 * Preserves every piece of smartness from the legacy components:
 *  - Draft persistence (glassy_bookmark_draft, one draft per page address; lib/saveDrafts.js)
 *  - Capture-rule pre-population via `defaults` prop (from useAppState ruleDefaults)
 *  - Pending element + pending/live screenshot pre-load with auto-expand
 *  - Deferred screenshot upload with 3-attempt backoff (never on mount)
 *  - Content-type re-fetch on preset change (GET_PAGE_META → structuredData)
 *  - Structured-data passthrough for type-aware reader rendering
 *  - Tag autocomplete, collection picker, "Add tags for me" switch (starts as Settings says)
 *  - QuickActions (Save Page / Screenshot) inline
 *  - Same payload contract (captureMode: 'quick' | 'smart') as before
 */
export default function SaveCard({
  pageMeta,
  user,
  saving,
  onSave,
  onSaveNote,
  onScreenshotCaptured,
  defaults,                 // ruleDefaults from useAppState
  pendingElement,
  pendingScreenshot,        // prior-session pending (from storage)
  onClearPending,
}) {
  // ── Form state ────────────────────────────────────────────────────────────
  const [title, setTitle] = useState('')
  const [contentType, setContentType] = useState(pageMeta?.contentType || 'bookmark')
  const [collectionId, setCollection] = useState(null)
  const [tags, setTags] = useState([])
  const [notes, setNotes] = useState('')
  const [aiAutoTag, setAiAutoTag] = useState(true)
  // The switch starts as Settings → "Add tags for me when saving" says. An unsent draft for
  // this page keeps the switch only if the person changed it there. (It used to start on
  // whatever Settings said.)
  const draftSetAiRef = useRef(false)
  const aiTouchedRef = useRef(false)
  // Drafts are written only after the form has taken in its draft, settings and rules, so
  // opening the form does not write a draft of its own starting values.
  const hydratedRef = useRef(false)
  const latestDraftRef = useRef(null)
  const draftPendingRef = useRef(false)
  useEffect(() => {
    let alive = true
    getSettings().then(s => {
      if (alive && !draftSetAiRef.current && typeof s?.aiAutoTag === 'boolean') setAiAutoTag(s.aiAutoTag)
    }).catch(() => {})
    return () => { alive = false }
  }, [])
  const [isPublic, setIsPublic] = useState(false)
  const [isPinned, setIsPinned] = useState(false)

  // ── Disclosure state ───────────────────────────────────────────────────────
  const [showNotes, setShowNotes] = useState(false)
  const [smartExpanded, setSmartExpanded] = useState(false)

  // ── Preview + screenshot state ──────────────────────────────────────────────
  const [showPreview, setShowPreview] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [contentMarkdown, setContentMarkdown] = useState('')
  const [screenshotUploading, setScreenshotUploading] = useState(false)
  const [screenshotError, setScreenshotError] = useState(null)

  // Structured data from the interpreter — preserved through the pipeline and
  // stored as bookmarks.structured_data server-side for type-aware rendering.
  const [structuredData, setStructuredData] = useState(pageMeta?.structuredData || {})

  // ── Refs (cross-render caches) ─────────────────────────────────────────────
  const draftTimer = useRef(null)
  const pendingAppliedRef = useRef(false)
  // Holds the raw screenshot data URL until the user decides to save. We do NOT
  // upload on mount — that would orphan an image on the server every time the
  // user opens the panel and then cancels. Upload happens in handleSave instead.
  const screenshotDataUrlRef = useRef(null)
  // Caches the uploaded absolute URL so a save retry doesn't re-upload.
  const uploadedScreenshotUrlRef = useRef(null)
  // Caches images collected by the element picker for the native gallery.
  const pendingElementImagesRef = useRef([])

  // ── Rule-defaults pre-population (runs once on mount) ───────────────────────
  // Seeds contentType, collection, tags, isPublic from server capture rules
  // that match the current URL. Also expands Smart if the rule sets a preset
  // or publicCandidate — the user should *see* the smartness that was applied.
  useEffect(() => {
    if (!defaults) return
    if (defaults.contentType) {
      setContentType(defaults.contentType)
      setSmartExpanded(true)   // show the preset chip that was auto-selected
    }
    if (defaults.projectId != null) setCollection(defaults.projectId)
    if (Array.isArray(defaults.tags) && defaults.tags.length) setTags(defaults.tags)
    if (defaults.isPublic) {
      setIsPublic(true)
      setSmartExpanded(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Draft persistence: one unsent form per page address (lib/saveDrafts.js) ──
  useEffect(() => {
    if (!pageMeta?.url) return
    let alive = true
    const done = () => { setTimeout(() => { if (alive) hydratedRef.current = true }, 0) }
    try {
      chrome.storage.local.get(BOOKMARK_DRAFT_KEY, (result) => {
        if (!alive) return
        if (chrome.runtime.lastError) { done(); return }   // storage read failed — keep fresh form
        const draft = draftFor(result?.[BOOKMARK_DRAFT_KEY], pageMeta.url)
        if (draft) {
          if (draft.title) setTitle(draft.title)
          if (draft.notes) { setNotes(draft.notes); setShowNotes(true) }
          if (Array.isArray(draft.tags)) setTags(draft.tags)
          if (draft.collectionId != null) setCollection(draft.collectionId)
          if (draft.contentType) setContentType(draft.contentType)
          if (typeof draft.isPublic === 'boolean') setIsPublic(draft.isPublic)
          if (typeof draft.isPinned === 'boolean') setIsPinned(draft.isPinned)
          if (draft.aiTouched && typeof draft.aiAutoTag === 'boolean') {
            draftSetAiRef.current = true
            aiTouchedRef.current = true
            setAiAutoTag(draft.aiAutoTag)
          }
          if (typeof draft.smartExpanded === 'boolean') setSmartExpanded(draft.smartExpanded)
        }
        done()
      })
    } catch { done() }
    return () => { alive = false }
  }, [pageMeta?.url])

  // Auto-fill title from pageMeta when available (legacy behavior).
  useEffect(() => {
    if (pageMeta?.title && !title) setTitle(pageMeta.title)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageMeta?.title])

  // Debounced draft write — same 500ms cadence as BookmarkCard — and flushed when the form
  // closes, so a tab switch in the side panel does not drop the last half second of typing.
  useEffect(() => {
    if (!pageMeta?.url) return
    latestDraftRef.current = {
      url: pageMeta.url,
      draft: {
        title, notes, tags, collectionId,
        contentType, isPublic, isPinned, smartExpanded,
        ...(aiTouchedRef.current ? { aiAutoTag, aiTouched: true } : {}),
      },
    }
    if (!hydratedRef.current) return
    draftPendingRef.current = true
    if (draftTimer.current) clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => {
      draftPendingRef.current = false
      const { url, draft } = latestDraftRef.current
      updateDrafts(stored => withDraft(stored, url, { ...draft, savedAt: Date.now() }))
    }, 500)
    return () => clearTimeout(draftTimer.current)
  }, [title, notes, tags, collectionId, pageMeta?.url, contentType, isPublic, isPinned, aiAutoTag, smartExpanded])

  useEffect(() => () => {
    if (!draftPendingRef.current || !latestDraftRef.current) return
    const { url, draft } = latestDraftRef.current
    updateDrafts(stored => withDraft(stored, url, { ...draft, savedAt: Date.now() }))
  }, [])

  // ── Pending capture pre-load (element picker / screenshot) ──────────────────
  // Mirrors SmartSavePanel's mount effect exactly. Auto-expands Smart + shows
  // the preview so the user sees what was captured without an extra tap.
  useEffect(() => {
    if (pendingAppliedRef.current) return
    if (pendingElement) {
      pendingAppliedRef.current = true
      setContentMarkdown(pendingElement.markdown || '')
      setContentType('bookmark')
      if (!title && pendingElement.textPreview) {
        setTitle(pendingElement.textPreview.slice(0, 100))
      }
      pendingElementImagesRef.current = pendingElement.images || []
      setShowPreview(true)
      setSmartExpanded(true)
      onClearPending?.()
    } else if (pendingScreenshot) {
      pendingAppliedRef.current = true
      setContentType('bookmark')   // screenshots save as bookmark captures
      screenshotDataUrlRef.current = pendingScreenshot.dataUrl
      const localMarkdown = `## 📸 Screenshot\n\n![Screenshot](${pendingScreenshot.dataUrl})\n\n*Captured from ${pendingScreenshot.title || 'current page'}*`
      setContentMarkdown(localMarkdown)
      setShowPreview(true)
      setSmartExpanded(true)
      if (!title && pendingScreenshot.title) {
        setTitle(`📸 ${pendingScreenshot.title}`)
      }
      onClearPending?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingElement, pendingScreenshot, onClearPending])

  // ── Screenshot upload (deferred to save time, 3-attempt backoff) ─────────────
  const uploadScreenshotWithRetry = useCallback(async (dataUrl) => {
    if (uploadedScreenshotUrlRef.current) return uploadedScreenshotUrlRef.current
    let lastErr
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await uploadCaptureImage(dataUrl)
        const url = result?.absoluteUrl || result?.url
        if (url) {
          uploadedScreenshotUrlRef.current = url
          return url
        }
        lastErr = new Error('Upload returned no URL')
      } catch (err) {
        lastErr = err
      }
      // Exponential backoff: 0.5s, 1s before the next retry.
      if (attempt < 2) await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
    }
    throw lastErr || new Error('Screenshot upload failed')
  }, [])

  // ── Content-type re-fetch (Smart preset change) ───────────────────────────────
  // Mirrors SmartSavePanel.handleContentTypeChange: when the user picks a
  // preset chip, re-run GET_PAGE_META to get updated structuredData for the
  // chosen type. Only meaningful when switching to a type that has an
  // interpreter (video, repo, article). Silently ignored on failure.
  const handleContentTypeChange = useCallback(async (newType) => {
    setContentType(newType)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const metaRes = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_META' })
      if (metaRes?.meta?.structuredData) {
        setStructuredData(metaRes.meta.structuredData)
      }
    } catch {
      // content script not present — keep existing structuredData
    }
  }, [])

  // ── Content preview load (Smart) ─────────────────────────────────────────────
  const handleLoadPreview = useCallback(async () => {
    if (showPreview) { setShowPreview(false); return }
    setPreviewLoading(true)
    setShowPreview(true)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STRUCTURED_CONTENT' })
      if (res?.markdown) {
        setContentMarkdown(res.markdown)
      }
    } catch {
      // silently fail — preview unavailable for this page
    } finally {
      setPreviewLoading(false)
    }
  }, [showPreview])

  // ── Save handler (unified: collapsed = quick, expanded = smart) ───────────────
  const handleSave = useCallback(async () => {
    // If this capture carries a deferred screenshot, upload it now and swap
    // the inline data-URL preview for the permanent server URL before saving.
    let markdown = contentMarkdown || undefined
    const dataUrl = screenshotDataUrlRef.current
    if (dataUrl) {
      setScreenshotError(null)
      setScreenshotUploading(true)
      // The side panel waits for this save: it must not move to another page mid-upload.
      holdPage()
      try {
        const url = await uploadScreenshotWithRetry(dataUrl)
        markdown = `## 📸 Screenshot\n\n![Screenshot](${url})\n\n*Captured from ${pendingScreenshot?.title || title || 'current page'}*`
        setContentMarkdown(markdown)
      } catch {
        setScreenshotUploading(false)
        setScreenshotError('The screenshot didn’t upload, so nothing was saved. Check your connection and save again.')
        releasePage()
        return
      }
      setScreenshotUploading(false)
    }

    const captureMode = smartExpanded ? 'smart' : 'quick'

    const payload = {
      sourceUrl: pageMeta.url,
      canonicalUrl: pageMeta.canonicalUrl,
      title: title || pageMeta?.title || pageMeta?.url,
      contentType,
      captureMode,
      status: isPublic ? 'public_candidate' : 'inbox',
      note: notes || '',
      projectIds: collectionId ? [collectionId] : [],
      visibleTags: tags,
      // Quick mode never sets pin/public; Smart mode honors the toggles.
      systemTags: (smartExpanded && isPinned) ? ['pinned'] : [],
      siteName: pageMeta.siteName || pageMeta?.domain || '',
      author: pageMeta.author || '',
      publishedAt: pageMeta.publishedAt || null,
      description: pageMeta.description || '',
      coverImageUrl: pageMeta.og_image || '',
      favicon_url: pageMeta.favicon_url || '',
      aiAutoTag,
      // Smart-only fields: contentMarkdown, structuredData, images.
      // Undefined in quick mode so the payload shape matches the legacy
      // quick payload (no extra keys).
      contentMarkdown: smartExpanded ? markdown : undefined,
      structuredData:
        smartExpanded && structuredData && Object.keys(structuredData).length > 0
          ? structuredData
          : undefined,
      images: smartExpanded
        ? (uploadedScreenshotUrlRef.current
            ? [{ url: uploadedScreenshotUrlRef.current, name: title || 'Screenshot' }]
            : pendingElementImagesRef.current.length
              ? pendingElementImagesRef.current
              : undefined)
        : undefined,
    }

    // The draft goes only when the save went through (saved, already saved, or waiting to be
    // sent): after a failed save the person's typing is still there.
    draftPendingRef.current = false
    clearTimeout(draftTimer.current)
    const savedUrl = pageMeta?.url
    const sent = onSave(payload)
    // onSave has now marked the save as running; the hold is no longer needed.
    if (dataUrl) releasePage()
    const ok = await sent
    if (ok !== false) updateDrafts(stored => withoutDraft(stored, savedUrl))
  }, [pageMeta, title, contentType, smartExpanded, collectionId, tags, notes, isPublic, isPinned, aiAutoTag, contentMarkdown, structuredData, onSave, pendingScreenshot, uploadScreenshotWithRetry])

  if (!pageMeta) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 16px', gap: 12 }}>
        <div className="spinner" style={{ width: 24, height: 24 }} />
        <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500 }}>Reading page content…</span>
      </div>
    )
  }

  const savingDisabled = saving || screenshotUploading || !pageMeta?.url
  const saveLabel = saving
    ? 'Saving…'
    : screenshotUploading
      ? 'Uploading screenshot…'
      : smartExpanded
        ? '✨ Smart Save'
        : '🔖 Save'

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Visual Header ───────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', height: 110, background: 'linear-gradient(45deg, #1e1b4b, #0f172a)' }}>
        {pageMeta.og_image && (
          <img
            src={pageMeta.og_image}
            className="og-image"
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', opacity: 0.8 }}
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
        )}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="glass-panel" style={{ width: 20, height: 20, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 2, background: 'rgba(255,255,255,0.1)' }}>
              {pageMeta.favicon_url ? (
                <img src={pageMeta.favicon_url} alt="" style={{ width: 14, height: 14 }} onError={e => { e.currentTarget.style.display = 'none' }} />
              ) : (
                <span style={{ fontSize: 11, opacity: 0.5 }}>▣</span>
              )}
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.01em' }}>
              {pageMeta.domain || 'page'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Essentials ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          className="glass-input"
          value={title || pageMeta.title || ''}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Page title…"
          style={{ fontWeight: 700, fontSize: 14 }}
        />

        <CollectionPicker value={collectionId} onChange={setCollection} />

        <TagEditor
          tags={tags}
          onChange={setTags}
          aiTag={aiAutoTag}
          onToggleAi={() => { aiTouchedRef.current = true; setAiAutoTag(!aiAutoTag) }}
        />

        {!showNotes ? (
          <button
            onClick={() => setShowNotes(true)}
            style={{
              background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)',
              borderRadius: 10, padding: '8px 12px', color: 'rgba(255,255,255,0.4)',
              fontSize: 11, cursor: 'pointer', textAlign: 'center', fontWeight: 500
            }}
          >
            + Add personal note
          </button>
        ) : (
          <textarea
            className="glass-input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What's on your mind?"
            rows={3}
            autoFocus
            style={{ minHeight: 80, lineHeight: 1.5 }}
          />
        )}
      </div>

      {/* ── QuickActions (Save Page / Screenshot) ────────────────────────────── */}
      <QuickActions
        pageMeta={pageMeta}
        onSaveNote={onSaveNote}
        onScreenshotCaptured={onScreenshotCaptured}
      />

      {/* ── Smart capture toggle pill ─────────────────────────────────────────── */}
      {/* Always visible, always one tap away. Replaces the buried
          "Switch to Smart Save" button. Auto-expands when pending captures
          arrive or when capture rules pre-populate a preset. */}
      <button
        type="button"
        onClick={() => setSmartExpanded(s => !s)}
        className="smart-toggle"
        aria-expanded={smartExpanded}
        title={smartExpanded ? 'Hide smart capture controls' : 'Show content type, visibility, and preview'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          width: '100%', padding: '8px 12px',
          background: smartExpanded ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.06)',
          border: '1px solid',
          borderColor: smartExpanded ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.18)',
          borderRadius: 10,
          color: smartExpanded ? '#c4b5fd' : '#818cf8',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <span style={{ fontSize: 13 }}>⚙</span>
        Smart capture
        <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 2 }}>
          {smartExpanded ? '▲' : '▾'}
        </span>
      </button>

      {/* ── Expanded smart controls ──────────────────────────────────────────── */}
      {smartExpanded && (
        <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 2 }}>
          {/* Preset type chips */}
          <div className="glass-card" style={{ padding: 10, display: 'flex', gap: 6, flexWrap: 'wrap', background: 'rgba(255,255,255,0.01)' }}>
            {Object.values(PRESETS).map(p => {
              const active = contentType === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => handleContentTypeChange(p.id)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: '1px solid',
                    borderColor: active ? 'var(--accent-light)' : 'rgba(255,255,255,0.05)',
                    background: active ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.02)',
                    color: active ? '#fff' : 'rgba(255,255,255,0.4)',
                    fontSize: 11,
                    fontWeight: active ? 600 : 500,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: active ? '0 0 12px rgba(99,102,241,0.2)' : 'none'
                  }}
                >
                  {p.icon} {p.label}
                </button>
              )
            })}
          </div>

          {/* Visibility / pin toggles (Smart-only; quick mode always uses inbox + no pin) */}
          <div className="glass-card" style={{ padding: 12, display: 'flex', gap: 20, background: 'rgba(255,255,255,0.01)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isPublic}
                onChange={e => setIsPublic(e.target.checked)}
                style={{ width: 14, height: 14, borderRadius: 4, accentColor: 'var(--accent)' }}
              />
              Public Candidate
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isPinned}
                onChange={e => setIsPinned(e.target.checked)}
                style={{ width: 14, height: 14, borderRadius: 4, accentColor: 'var(--accent)' }}
              />
              Pin to Today
            </label>
          </div>

          {/* Content preview toggle */}
          <button
            type="button"
            onClick={handleLoadPreview}
            className="btn-ghost"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '8px 12px', fontSize: 11, width: '100%',
            }}
          >
            {previewLoading
              ? <><span className="spinner" style={{ width: 12, height: 12 }} />Loading…</>
              : showPreview
                ? <>📖 Hide Preview</>
                : <>📖 Preview Content</>}
          </button>

          {showPreview && (
            <ContentPreview
              markdown={contentMarkdown}
              onMarkdownChange={setContentMarkdown}
              title={title}
            />
          )}

          {screenshotError && (
            <div role="alert" style={{ fontSize: 11, color: '#ff8a8a', background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.25)', borderRadius: 8, padding: '8px 10px' }}>
              {screenshotError}
            </div>
          )}
        </div>
      )}

      {/* ── Primary Save button: stays at the bottom of the view while the form scrolls ── */}
      <div style={{ position: 'sticky', bottom: 0, paddingTop: 8, paddingBottom: 2, background: 'linear-gradient(to bottom, rgba(8,8,12,0), #08080c 40%)', zIndex: 2 }}>
        <button className="btn-accent" onClick={handleSave} disabled={savingDisabled} style={{ width: '100%' }}>
          {saving || screenshotUploading ? <span className="spinner" /> : null}
          {saveLabel}
        </button>
      </div>
    </div>
  )
}