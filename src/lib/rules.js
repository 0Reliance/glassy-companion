/**
 * Client-side rule evaluation engine.
 */

/**
 * @typedef {Object} CaptureRule
 * @property {string} [domain]
 * @property {string} [path]
 * @property {string} [preset]
 * @property {string} [destination]
 * @property {string[]} [tags]
 * @property {boolean} [publicCandidate]
 */

/**
 * Normalize the server's capture-rules payload into a plain rule array.
 *
 * GET /api/capture-rules responds with a `{ rules: [...] }` wrapper object
 * (see server/routes/captureRoutes.js). A bare array is also accepted for
 * forward/backward compatibility. Anything else yields an empty list so the
 * save flow degrades gracefully instead of skipping rule pre-population
 * silently (the v2.2.0–v2.17.0 regression: callers checked Array.isArray()
 * on the wrapper object, which is never true).
 *
 * @param {*} payload — response body from GET /api/capture-rules
 * @returns {CaptureRule[]}
 */
export function toRulesArray(payload) {
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.rules)) return payload.rules
  return []
}

/**
 * Evaluates rules against the current page context.
 * @param {string} url
 * @param {CaptureRule[]} rules
 */
export function evaluateRules(url, rules) {
  let parsedUrl
  try {
    parsedUrl = new URL(url)
  } catch {
    return {
      preset: null,
      destination: null,
      tags: [],
      publicCandidate: false,
    }
  }

  const results = {
    preset: null,
    destination: null,
    tags: [],
    publicCandidate: false,
  }

  for (const rule of rules) {
    const hasDomain = Boolean(rule.domain)
    const hasPath = Boolean(rule.path)
    if (!hasDomain && !hasPath) continue

    const domainMatches = !hasDomain || parsedUrl.hostname === rule.domain || parsedUrl.hostname.endsWith(`.${rule.domain}`)
    const pathMatches = !hasPath || parsedUrl.pathname.includes(rule.path)
    const match = domainMatches && pathMatches

    if (match) {
      if (rule.preset) results.preset = rule.preset
      if (rule.destination) results.destination = rule.destination
      if (rule.tags) results.tags = [...new Set([...results.tags, ...rule.tags])]
      if (rule.publicCandidate) results.publicCandidate = true
    }
  }

  return results
}
