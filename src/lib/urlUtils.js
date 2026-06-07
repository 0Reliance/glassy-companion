/**
 * Shared URL utilities for Glassy Companion.
 */

/** Extract hostname from URL safely. */
export function getHostname(url) {
  try {
    return new URL(url).hostname
  } catch {
    return 'this page'
  }
}

/** Compare two URLs ignoring hash fragments. */
export function sameDocumentUrl(left, right) {
  try {
    const l = new URL(left)
    const r = new URL(right)
    l.hash = ''
    r.hash = ''
    return l.href === r.href
  } catch {
    return left === right
  }
}

// Hosts/IP ranges the server rejects for SSRF protection (urlValidator.js).
// We mirror them here so the popup can warn the user *before* a save attempt
// instead of surfacing an opaque "Invalid URL" error from the server.
const BLOCKED_HOSTS = new Set([
  'localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1',
  'metadata.google.internal', 'metadata.internal',
])
const BLOCKED_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^127\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^198\.18\./,
]

/**
 * True when a URL cannot be saved to Glassy — non-http(s) schemes (chrome://,
 * about:, file:) and private/loopback hosts blocked by the server's SSRF guard.
 * @param {string} url
 */
export function isUnsavableUrl(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return true
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return true
  const host = parsed.hostname.toLowerCase()
  if (BLOCKED_HOSTS.has(host)) return true
  if (host.startsWith('::ffff:')) return true
  if (/^\d+$/.test(host)) return true // decimal IP notation
  return BLOCKED_IP_RANGES.some(re => re.test(host))
}
