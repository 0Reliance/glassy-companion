import { useEffect, useState } from 'react'
import { fetchCapabilities, DEFAULT_CAPABILITIES } from '../../lib/api.js'

/**
 * The client-side capability gate. The split rule applies to clients: a
 * self-host capability is invisible until the /api/capabilities manifest says
 * it exists, and any failure resolves to the fail-closed defaults (never a
 * throw, never a false positive). The manifest is public/unauthenticated and
 * Cache-Control: max-age=30 on the server, so this is one cheap fetch per
 * popup open.
 */
export default function useCapabilities() {
  const [capabilities, setCapabilities] = useState(DEFAULT_CAPABILITIES)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    let alive = true
    fetchCapabilities().then(caps => {
      if (alive) { setCapabilities(caps); setResolved(true) }
    })
    return () => { alive = false }
  }, [])

  return { capabilities, resolved }
}