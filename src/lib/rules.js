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
