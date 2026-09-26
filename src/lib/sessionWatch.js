/**
 * sessionWatch — keep the UI honest about the session.
 *
 * apiFetch clears the stored token on an interactive 401. Nothing used to tell the
 * popup, so it kept rendering a logged-in shell whose every action then failed — a UI
 * actively disagreeing with storage. This is the half that fixes the stranded state,
 * and it covers EVERY interactive 401 rather than the one caller that first exposed it.
 */
import { STORAGE_KEYS } from './constants.js'

/**
 * @param {() => void} onEnd — called when the stored token disappears
 * @returns {() => void} unsubscribe
 */
export function watchSessionEnd(onEnd) {
  const onChanged = (changes, area) => {
    if (area !== 'local') return
    const change = changes?.[STORAGE_KEYS.token]
    if (!change) return
    // Only REMOVAL ends a session. A login or a token refresh writes a newValue and
    // must not bounce the user to the login screen.
    if (change.newValue) return
    try { onEnd() } catch { /* a throwing listener must not break the storage event */ }
  }
  try {
    chrome.storage.onChanged.addListener(onChanged)
  } catch {
    return () => {}          // storage unavailable (tests, early boot)
  }
  return () => {
    try { chrome.storage.onChanged.removeListener(onChanged) } catch { /* already gone */ }
  }
}
