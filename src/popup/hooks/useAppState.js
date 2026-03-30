import { useState, useEffect, useCallback, useRef } from 'react'
import { checkAuth, getActiveTabMeta } from './useExtensionBridge.js'

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
  const [saveStatus, setSaveStatus] = useState('idle') // idle | saving | saved | duplicate | error
  const [errorMessage, setErrorMessage] = useState('')
  const initRef = useRef(false)

  // Check startup hash for direct-to-note routing
  const getInitialView = useCallback(() => {
    const hash = window.location.hash
    if (hash === '#note') return 'note'
    if (hash === '#search') return 'search'
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

        setView(getInitialView())
        const metaRes = await getActiveTabMeta()
        if (metaRes?.meta) setPageMeta(metaRes.meta)
      } catch (err) {
        console.error('[Popup] init error', err)
        setView('login')
      }
    })()
  }, [getInitialView])

  const handleLoginSuccess = useCallback((loggedInUser) => {
    setUser(loggedInUser)
    if (!loggedInUser?.entitlements?.glassy_keep) {
      setView('no_entitlement')
      return
    }
    setView(getInitialView())
    getActiveTabMeta()
      .then((res) => { if (res?.meta) setPageMeta(res.meta) })
      .catch(() => {})
  }, [getInitialView])

  const navigate = useCallback((target) => {
    setSaveStatus('idle')
    setErrorMessage('')
    setView(target)
  }, [])

  const setSaving = useCallback(() => setSaveStatus('saving'), [])
  const setSaved = useCallback((url) => {
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
