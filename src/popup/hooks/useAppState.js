import { useState, useEffect, useCallback, useRef } from 'react'
import { checkAuth, getActiveTabMeta } from './useExtensionBridge.js'
import { fetchCaptureRules } from '../../lib/api.js'
import { evaluateRules } from '../../lib/rules.js'

/**
 * Central app state hook — manages auth, routing, page meta, and save status.
 *
 * Views: loading | login | no_entitlement | save | note | search | settings
 * Save status: idle | saving | saved | duplicate | error
 */
export default function useAppState() {
  const [view, setView] = useState('loading')
  const [user, setUser] = useState(null)
  const [pageMeta, setPageMeta] = useState(null)
  const [ruleDefaults, setRuleDefaults] = useState(null)
  const [saveStatus, setSaveStatus] = useState('idle') // idle | saving | saved | duplicate | error
  const [errorMessage, setErrorMessage] = useState('')
  const initRef = useRef(false)

  // Check startup hash and session-stored route hint for direct-to-tab routing.
  // Background sets `glassy_open_view` when opening the popup via the
  // quick-note shortcut / context menu, so we honor that on first paint.
  const resolveInitialView = useCallback(async () => {
    const hash = window.location.hash
    if (hash === '#note') return 'note'
    if (hash === '#search') return 'search'
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.session.get('glassy_open_view', resolve)
      })
      const target = result?.glassy_open_view
      if (target === 'note' || target === 'search' || target === 'save') {
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

        if (!authRes.user?.entitlements?.glassy_keep) {
          setView('no_entitlement')
          return
        }

        setView(await resolveInitialView())
        const metaRes = await getActiveTabMeta()
        if (metaRes?.meta) {
          setPageMeta(metaRes.meta)
          // Best-effort: pull capture rules and pre-populate SmartSave defaults.
          // Failures are silent — the panel still works without rule guidance.
          try {
            const rules = await fetchCaptureRules()
            if (Array.isArray(rules) && rules.length && metaRes.meta.url) {
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
      } catch (err) {
        console.error('[Popup] init error', err)
        setView('login')
      }
    })()
  }, [resolveInitialView])

  const handleLoginSuccess = useCallback(async (loggedInUser) => {
    setUser(loggedInUser)
    if (!loggedInUser?.entitlements?.glassy_keep) {
      setView('no_entitlement')
      return
    }
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
  const setError = useCallback((msg) => {
    setSaveStatus('error')
    setErrorMessage(msg)
  }, [])
  const resetSaveStatus = useCallback(() => {
    setSaveStatus('idle')
    setErrorMessage('')
  }, [])

  return {
    view,
    user,
    pageMeta,
    ruleDefaults,
    saveStatus,
    errorMessage,
    navigate,
    handleLoginSuccess,
    setSaving,
    setSaved,
    setDuplicate,
    setError,
    resetSaveStatus,
    setUser,
    setPageMeta,
  }
}
