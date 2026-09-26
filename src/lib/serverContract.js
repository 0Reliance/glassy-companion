/**
 * serverContract — the ONE answer to "what can this server do?"
 *
 * The extension used to re-derive this per feature, nine different ways, and each
 * guess needed a bespoke fallback when it was wrong. That produced interpretStatus(),
 * which required a `mounted` claim from /mcp/status — a field that endpoint has never
 * emitted in any commit of glassy-dash. The predicate was right; the source was wrong.
 *
 * This module reads the authoritative source instead: GET /api/capabilities, fetched
 * once, cached, deduped, and projected into the booleans surfaces actually gate on.
 *
 * TWO CONCEPTS, KEPT APART:
 *   capability — static per instance. Does this server support vault/MCP/notifications?
 *                Gates surface VISIBILITY. That is this module.
 *   liveness   — dynamic per feature. Is the Obsidian bridge connected right now?
 *                Gates surface STATE. That is lib/obsidianStatus.js, never this.
 * Conflating them is why the Vault tab rendered on cloud while the dashboard hid it.
 */
import { getBaseUrl } from './auth.js'
import { fetchManifest } from './api.js'

const CACHE_KEY = 'glassy_server_contract'
// Mirrors the server's own `Cache-Control: public, max-age=30, must-revalidate`.
const TTL_MS = 30_000

/**
 * What every surface resolves to when there is nothing to trust: no cache AND a
 * failed fetch. The split rule applies to clients too — a self-host capability is
 * invisible until the manifest says it exists. Frozen so a consumer cannot mutate the
 * shared fail-closed object and leak state between popups.
 */
export const FAIL_CLOSED = Object.freeze({
  version: null,
  instanceId: null,
  deploymentLocality: null,
  mcp: Object.freeze({ available: false, enabled: false, tools: 0 }),
  vault: Object.freeze({ available: false }),
  notifications: Object.freeze({ available: false }),
  agentIdentity: Object.freeze({ available: false, mode: 'single-key' }),
  stale: false,
  resolved: false,
})

const obj = (v) => ((v && typeof v === 'object') ? v : {})

/**
 * Project a raw manifest into the contract. Pure, total, never throws: every flag is
 * read with `=== true` so an ABSENT key fails closed exactly like a false one. That is
 * not defensive padding — cloud v2.40.0 publishes no `mcp.mounted` key at all, and
 * treating absence as availability is the bug this module replaces.
 *
 * @param {object|null|undefined} manifest
 * @returns {object} a frozen Contract with resolved:true
 */
export function projectContract(manifest) {
  const raw = obj(manifest)
  const caps = obj(raw.capabilities)
  const mcp = obj(caps.mcp)
  const vault = obj(caps.vault)
  const notif = obj(caps.notifications)
  const ident = obj(caps.agentIdentity)

  return Object.freeze({
    version: typeof raw.version === 'string' ? raw.version : null,
    instanceId: typeof raw.instanceId === 'string' ? raw.instanceId : null,
    deploymentLocality: typeof raw.deploymentLocality === 'string' ? raw.deploymentLocality : null,
    mcp: Object.freeze({
      // `mounted`, NOT `enabled`. `enabled` is what the config INTENDS; `mounted` is
      // what the process ACHIEVED (#125). A box whose MCP failed to attach would
      // otherwise advertise tools it cannot serve.
      available: mcp.mounted === true,
      enabled: mcp.enabled === true,
      tools: Number(mcp.tools) || 0,
    }),
    vault: Object.freeze({ available: vault.available === true }),
    notifications: Object.freeze({ available: notif.available === true }),
    agentIdentity: Object.freeze({
      available: ident.available === true,
      mode: ident.mode === 'named-keys' ? 'named-keys' : 'single-key',
    }),
    stale: false,
    resolved: true,
  })
}

// Collapses concurrent callers. Popup.jsx and McpConnectionSection.jsx each mount a
// hook; without this the popup fires two manifest fetches per open.
let inflight = null

/**
 * Read the contract for the currently configured server.
 *
 * Order matters: cache first (so a warm popup does no network), then in-flight dedupe,
 * then fetch. On failure return the STALE cached contract if one exists — a transient
 * blip must not silently disable every self-host feature — and fail closed only when
 * there is genuinely nothing to trust.
 *
 * @param {{forceRefresh?: boolean}} [opts]
 * @returns {Promise<object>} a frozen Contract; never throws
 */
export async function getServerContract({ forceRefresh = false } = {}) {
  let baseUrl = null
  try { baseUrl = await getBaseUrl() } catch { baseUrl = null }

  if (!forceRefresh && baseUrl) {
    try {
      const stored = await chrome.storage.local.get(CACHE_KEY)
      const cached = stored?.[CACHE_KEY]
      // baseUrl lives INSIDE the entry, so pointing the extension at a different server
      // is a miss by construction — no stale cloud manifest can survive a switch to a
      // self-host appliance, and no key enumeration is needed to guarantee it.
      if (cached?.baseUrl === baseUrl && cached?.data && Date.now() - cached.fetchedAt < TTL_MS) {
        return projectContract(cached.data)
      }
    } catch { /* storage unavailable (tests, early boot) — fall through to fetch */ }
  }

  if (inflight) return inflight

  inflight = (async () => {
    try {
      const manifest = await fetchManifest()
      const contract = projectContract(manifest)
      try {
        await chrome.storage.local.set({
          [CACHE_KEY]: { baseUrl, data: manifest, fetchedAt: Date.now() },
        })
      } catch { /* caching is an optimisation; a write failure must not fail the read */ }
      return contract
    } catch {
      try {
        const stored = await chrome.storage.local.get(CACHE_KEY)
        const cached = stored?.[CACHE_KEY]
        // Stale beats blind: the cached manifest still describes this deployment, and a
        // stale CLOUD contract says available:false, so this can never produce the false
        // positive the split rule exists to prevent.
        if (cached?.baseUrl === baseUrl && cached?.data) {
          return Object.freeze({ ...projectContract(cached.data), stale: true })
        }
      } catch { /* fall through to FAIL_CLOSED */ }
      return FAIL_CLOSED
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/**
 * Drop the cached contract and cancel any dedupe state. Call on server-URL change
 * (auth.js setBaseUrl) and on logout, so the next read cannot inherit another
 * instance's capabilities.
 */
export async function invalidateServerContract() {
  inflight = null
  try { await chrome.storage.local.remove(CACHE_KEY) } catch { /* storage unavailable */ }
}

