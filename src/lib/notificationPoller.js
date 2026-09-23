/**
 * notificationPoller — the plain, testable core behind the popup's unread badge.
 *
 * The split rule applies to clients: the awareness lane is SELF-HOST ONLY, so
 * the poller takes an `isAvailable` gate (backed by the /api/capabilities
 * manifest) and never fetches while it reads false — a cloud user's extension
 * sends nothing. A failing poll reports ZERO and keeps polling: the badge is
 * advisory, never load-bearing, and must not die because one tick failed.
 */

/**
 * @param {object} opts
 * @param {() => Promise<{notifications: Array, unreadCount: number}>} opts.fetcher
 * @param {number} [opts.intervalMs=60000] — poll cadence while unread; the
 *   server's lane is advisory (≤10 notifications/min per agent by design).
 * @param {(state: {notifications: Array, unreadCount: number}) => void} opts.onUpdate
 * @param {boolean | (() => boolean)} [opts.isAvailable=true] — the capability gate
 * @returns {() => void} stop
 */
export function startPolling({ fetcher, intervalMs = 60_000, onUpdate, isAvailable = true }) {
  let stopped = false
  const gate = () => (typeof isAvailable === 'function' ? isAvailable() : isAvailable)

  const tick = async () => {
    if (stopped) return
    if (!gate()) return // capability unavailable (cloud): no fetch, no badge
    let state = { notifications: [], unreadCount: 0 }
    try {
      state = await fetcher()
    } catch {
      state = { notifications: [], unreadCount: 0 }
    }
    if (stopped) return
    onUpdate(state)
  }

  // Fire the first check immediately, then keep the cadence.
  tick()
  const timer = setInterval(tick, intervalMs)

  return () => {
    stopped = true
    clearInterval(timer)
  }
}