/**
 * obsidianStatus — shared LIVENESS for the Obsidian bridge.
 *
 * Not part of the server contract, and deliberately so. The contract answers "does this
 * instance support the vault at all" (static, per-instance, gates VISIBILITY). This
 * answers "is the bridge connected right now" (dynamic, per-user, gates STATE).
 * Conflating the two is what left the Vault tab rendering on cloud while the dashboard
 * hid it correctly.
 *
 * It exists because four components each fetched this independently on mount —
 * RelatedInVaultPanel, TagEditor, QuickNoteView, VaultBrowserView — so one popup open
 * meant four round trips to the same endpoint.
 */
import { getObsidianStatus } from './api.js'

// Short, because liveness genuinely changes while the popup is open; long enough to
// collapse the four simultaneous mounts into one request.
const TTL_MS = 15_000

let cached = null        // { data, fetchedAt }
let inflight = null

/**
 * @param {{forceRefresh?: boolean}} [opts] — pass forceRefresh after a user action
 *   that should change the answer (reconnecting, saving bridge settings).
 * @returns {Promise<object|null>} the status body, or null if unreachable. Never throws.
 */
export async function getSharedObsidianStatus({ forceRefresh = false } = {}) {
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.data
  if (inflight && !forceRefresh) return inflight

  inflight = (async () => {
    try {
      const data = await getObsidianStatus()
      // A failure is deliberately NOT cached: four components would otherwise stay
      // pinned to a stale error for the whole TTL after a bridge that blipped once.
      cached = { data, fetchedAt: Date.now() }
      return data
    } catch {
      return null
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/** Drop cached liveness. Call after saving bridge settings or reconnecting. */
export async function invalidateObsidianStatus() {
  cached = null
  inflight = null
}
