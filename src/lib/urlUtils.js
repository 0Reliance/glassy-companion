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
