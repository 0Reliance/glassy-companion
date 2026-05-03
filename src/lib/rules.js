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
  const parsedUrl = new URL(url)
  const results = {
    preset: null,
    destination: null,
    tags: [],
    publicCandidate: false,
  }

  for (const rule of rules) {
    let match = false

    if (rule.domain && parsedUrl.hostname.includes(rule.domain)) {
      match = true
    }

    if (rule.path && parsedUrl.pathname.includes(rule.path)) {
      match = true
    }

    if (match) {
      if (rule.preset) results.preset = rule.preset
      if (rule.destination) results.destination = rule.destination
      if (rule.tags) results.tags = [...new Set([...results.tags, ...rule.tags])]
      if (rule.publicCandidate) results.publicCandidate = true
    }
  }

  return results
}
