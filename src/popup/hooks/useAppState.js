import { useState, useEffect, useCallback, useRef } from 'react'
import { checkAuth, getActiveTabMeta, checkDuplicateUrl } from './useExtensionBridge.js'
import { fetchCaptureRules } from '../../lib/api.js'
import { evaluateRules, toRulesArray } from '../../lib/rules.js'
import { watchSessionEnd } from '../../lib/sessionWatch.js'

/**
 * Central app state hook — manages auth, routing, page meta, and save status.
 *
 * Views: loading | login | save | note | search | settings
 * Save status: idle | saving | saved | duplicate | error | queued
 */
/** True in the side panel, false in the popup (both render the same app). */
export function isSidePanel() {
  try { return /\/sidepanel\//.test(window.location.pathname) } catch { return false }
}

export default function useAppState() {
  const [view, setView] = useState('loading')
  const [user, setUser] = useState(null)
  const [pageMeta, setPageMeta] = useState(null)
  const [ruleDefaults, setRuleDefaults] = useState(null)
  const [alreadySaved, setAlreadySaved] = useState(false)
  const [saveStatus, setSaveStatus] = useState('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [lastCaptureId, setLastCaptureId] = useState(null)
  const [pendingElement, setPendingElement] = useState(null)
  const [pendingScreenshot, setPendingScreenshot] = useState(null)
  const initRef = useRef(false)

  // The UI must never disagree with storage. An interactive 401 clears the token inside
  // apiFetch; without this the popup keeps showing a logged-in shell whose every action
  // then fails. Covers every interactive 401, not just the notification poller that
  // first exposed it.
  useEffect(() => watchSessionEnd(() => {
    setUser(null)
    setPageMeta(null)
    setView('login')
  }), [setUser, setPageMeta])

  // Check startup hash and session-stored route hint for direct-to-tab routing.
  // Background sets `glassy_open_view` when opening the popup via the
  // quick-note shortcut / context menu, so we honor that on first paint.
  const resolveInitialView = useCallback(async () => {
    const hash = window.location.hash
    if (hash === '#note') return 'note'
    if (hash === '#search') return 'search'
    if (hash === '#vault') return 'vault'
    if (hash === '#kb') return 'kb'
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.session.get('glassy_open_view', resolve)
      })
      const target = result?.glassy_open_view
      if (target === 'note' || target === 'search' || target === 'vault' || target === 'kb' || target === 'save') {
        chrome.storage.session.remove('glassy_open_view')
        return target
      }
    } catch {}
    return 'save'
  }, [])

  // On mount: check auth, then fetch page meta
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    ;(async () => {
      try {
        const authRes = await checkAuth()
        if (!authRes?.authenticated) {
          setView('login')
          return
        }
        setUser(authRes.user)

        setView(await resolveInitialView())
        const metaRes = await getActiveTabMeta()
        if (metaRes?.meta) {
          setPageMeta(metaRes.meta)
          // Pre-flight duplicate check — show "Already saved" badge.
          if (metaRes.meta.url) {
            checkDuplicateUrl(metaRes.meta.url).then(res => {
              if (res?.saved) setAlreadySaved(true)
            }).catch(() => {})
          }
          // Best-effort: pull capture rules and pre-populate SmartSave defaults.
          // Failures are silent — the panel still works without rule guidance.
          try {
            // GET /api/capture-rules responds with `{ rules: [...] }` — normalize
            // before evaluating (regression guard: Array.isArray() on the wrapper
            // object is never true and silently disabled rule pre-population).
            const rules = toRulesArray(await fetchCaptureRules())
            if (rules.length && metaRes.meta.url) {
              const result = evaluateRules(metaRes.meta.url, rules)
              const hasAny = result.preset || result.destination || result.tags.length || result.publicCandidate
              if (hasAny) {
                setRuleDefaults({
                  contentType: result.preset || undefined,
                  projectId: result.destination || undefined,
                  tags: result.tags || [],
                  isPublic: !!result.publicCandidate,
                })
              }
            }
          } catch {}
        }

        // Consume any pending capture results from the element picker or screenshot.
        // These are stored by the content script / QuickActions during prior popup
        // sessions and picked up here on next open. Clean them up after reading.
        try {
          const pending = await chrome.storage.local.get([
            'glassy_pending_element',
            'glassy_pending_screenshot',
          ])
          if (pending.glassy_pending_element) {
            setPendingElement(pending.glassy_pending_element)
          }
          if (pending.glassy_pending_screenshot) {
            setPendingScreenshot(pending.glassy_pending_screenshot)
          }
          await chrome.storage.local.remove([
            'glassy_pending_element',
            'glassy_pending_screenshot',
          ])
        } catch {}
      } catch (err) {
        console.error('[Popup] init error', err)
        setView('login')
      }
    })()
  }, [resolveInitialView])

  // The side panel stays open while the person browses. It read the page once, when it
  // opened, so after moving to another tab or page it still showed, and saved, the first
  // one. It now reads the page again when the active tab changes or finishes loading.
  // The popup closes on its own, so it does not listen.
  useEffect(() => {
    if (!isSidePanel() || !chrome?.tabs?.onActivated) return undefined
    let alive = true
    let timer = null
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        try {
          const metaRes = await getActiveTabMeta()
          if (!alive || !metaRes?.meta) return
          setPageMeta(metaRes.meta)
          setAlreadySaved(false)
          if (metaRes.meta.url) {
            checkDuplicateUrl(metaRes.meta.url).then(res => {
              if (alive && res?.saved) setAlreadySaved(true)
            }).catch(() => {})
          }
        } catch { /* the panel keeps the page it has */ }
      }, 250)
    }
    const onActivated = () => refresh()
    const onUpdated = (_tabId, changeInfo, tab) => {
      if (tab?.active && changeInfo?.status === 'complete') refresh()
    }
    chrome.tabs.onActivated.addListener(onActivated)
    chrome.tabs.onUpdated.addListener(onUpdated)
    return () => {
      alive = false
      clearTimeout(timer)
      chrome.tabs.onActivated.removeListener(onActivated)
      chrome.tabs.onUpdated.removeListener(onUpdated)
    }
  }, [])

  const handleLoginSuccess = useCallback(async (loggedInUser) => {
    setUser(loggedInUser)
    setView(await resolveInitialView())
    getActiveTabMeta()
      .then((res) => { if (res?.meta) setPageMeta(res.meta) })
      .catch(() => {})
  }, [resolveInitialView])

  const navigate = useCallback((target) => {
    setSaveStatus('idle')
    setErrorMessage('')
    setView(target)
  }, [])

  const setSaving = useCallback(() => setSaveStatus('saving'), [])
  const setSaved = useCallback(() => {
    setSaveStatus('saved')
  }, [])
  const setDuplicate = useCallback(() => setSaveStatus('duplicate'), [])
  const setQueued = useCallback(() => setSaveStatus('queued'), [])
  const setError = useCallback((msg) => {
    setSaveStatus('error')
    setErrorMessage(msg)
  }, [])
  const resetSaveStatus = useCallback(() => {
    setSaveStatus('idle')
    setErrorMessage('')
  }, [])

  const clearPending = useCallback(() => {
    setPendingElement(null)
    setPendingScreenshot(null)
  }, [])

  return {
    view,
    user,
    pageMeta,
    ruleDefaults,
    alreadySaved,
    saveStatus,
    errorMessage,
    lastCaptureId,
    pendingElement,
    pendingScreenshot,
    navigate,
    handleLoginSuccess,
    setSaving,
    setSaved,
    setDuplicate,
    setQueued,
    setError,
    resetSaveStatus,
    clearPending,
    setUser,
    setPageMeta,
    setLastCaptureId,
    setAlreadySaved,
  }
}
