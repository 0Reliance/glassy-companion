import { useEffect, useState } from 'react'
import { getServerContract, FAIL_CLOSED } from '../../lib/serverContract.js'

/**
 * The client-side capability gate. The split rule applies to clients: a self-host
 * capability is invisible until the /api/capabilities manifest says it exists, and
 * every failure path resolves to FAIL_CLOSED — never a throw, never a false positive.
 *
 * TWO DIFFERENT `resolved` FLAGS, and conflating them is a bug:
 *   resolved (returned here) — the promise SETTLED. Safe to act on: a gated surface can
 *                              now be redirected away from without flicker.
 *   contract.resolved        — we hold a TRUSTWORTHY manifest. False on FAIL_CLOSED,
 *                              i.e. nothing cached and the fetch failed.
 * A settled-but-untrustworthy contract is a real state (server unreachable), and the UI
 * must fail closed rather than guess.
 */
export default function useServerContract() {
  const [contract, setContract] = useState(FAIL_CLOSED)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    let alive = true
    getServerContract().then(c => {
      // The popup closes mid-fetch constantly; setting state on an unmounted tree warns
      // in dev and can resurrect a surface the user already navigated away from.
      if (!alive) return
      setContract(c)
      setResolved(true)
    })
    return () => { alive = false }
  }, [])

  return { contract, resolved }
}
