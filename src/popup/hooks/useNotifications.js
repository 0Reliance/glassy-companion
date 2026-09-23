import { useEffect, useState } from 'react'
import { startPolling } from '../../lib/notificationPoller.js'
import { fetchUnreadNotifications } from '../../lib/api.js'

/**
 * The awareness lane in the browser: the owner's unread agent notifications
 * (self-host only — the caller passes the capability gate; the poller itself
 * also refuses to fetch while the gate reads false, so a mid-session manifest
 * change cannot leak a poll). The badge is advisory: failures report zero and
 * keep polling.
 *
 * @param {{ available: boolean }} notificationsCapability — from useCapabilities
 * @returns {{ unreadCount: number, notifications: Array }}
 */
export default function useNotifications({ available } = { available: false }) {
  const [state, setState] = useState({ notifications: [], unreadCount: 0 })

  useEffect(() => {
    if (!available) return undefined // cloud: no polls, no badge, nothing
    const stop = startPolling({
      fetcher: fetchUnreadNotifications,
      intervalMs: 60_000,
      onUpdate: setState,
    })
    return stop
  }, [available])

  return state
}