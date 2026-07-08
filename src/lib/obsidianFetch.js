/**
 * Obsidian Local REST API fetch client — runs in the browser extension's
 * service worker, which lives in the same network namespace as Obsidian.
 * This is the key advantage: the extension can reach 127.0.0.1:27124 on the
 * Windows host directly, bypassing WSL2/Docker container networking entirely.
 *
 * Mirrors the server's createObsidianRequestWithFallback logic:
 *   1. Try the configured URL (HTTPS 27124 by default)
 *   2. On TLS error, retry with HTTP (port 27123)
 *   3. Firefox MV3 has stricter TLS rules — prefer HTTP on loopback for FF
 */

const DEFAULT_TIMEOUT_MS = 10000
const OBSIDIAN_HTTPS_PORT = '27124'
const OBSIDIAN_HTTP_PORT = '27123'

/**
 * Detect Firefox (has stricter self-signed cert handling in MV3).
 * @returns {boolean}
 */
function isFirefox() {
  return typeof browser !== 'undefined' && typeof chrome === 'undefined'
}

/**
 * Build the HTTP-fallback URL from a configured HTTPS URL.
 * Mirrors the server's buildHttpFallbackUrl: https://127.0.0.1:27124 → http://127.0.0.1:27123
 * @param {string} url
 * @returns {string}
 */
function buildHttpFallbackUrl(url) {
  try {
    const u = new URL(url)
    u.protocol = 'http:'
    if (u.port === OBSIDIAN_HTTPS_PORT) {
      u.port = OBSIDIAN_HTTP_PORT
    }
    return u.toString()
  } catch {
    return url.replace(/^https/, 'http')
  }
}

/**
 * Check if an error is a TLS/SSL error that warrants HTTP fallback.
 * @param {Error} err
 * @returns {boolean}
 */
function isTlsError(err) {
  if (!err) return false
  const msg = String(err.message || '').toLowerCase()
  return (
    msg.includes('cert') || msg.includes('ssl') || msg.includes('tls') ||
    msg.includes('self-signed') || msg.includes('unable to verify') ||
    msg.includes('err_cert_authority_invalid') || msg.includes('bad certificate')
  )
}

/**
 * Fetch a resource from the Obsidian Local REST API with automatic HTTPS→HTTP
 * fallback. Runs from the extension's service worker, which shares the host's
 * network namespace and can reach Obsidian on 127.0.0.1 directly.
 *
 * @param {string} url - Full Obsidian API URL (e.g. https://127.0.0.1:27124/search/simple/)
 * @param {Object} options
 * @param {string} options.token - Obsidian API bearer token
 * @param {string} [options.method='GET'] - HTTP method
 * @param {Object|null} [options.body=null] - JSON body (object, will be stringified)
 * @param {Object} [options.headers={}] - Additional headers
 * @param {number} [options.timeoutMs=10000] - Request timeout
 * @returns {Promise<{status: number, body: string, ok: boolean}>}
 */
export async function obsidianFetch(url, { token, method = 'GET', body = null, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!token) throw new Error('Obsidian API token is required')

  const parsed = (() => { try { return new URL(url) } catch { return null } })()
  if (!parsed) throw new Error(`Invalid Obsidian URL: ${url}`)

  // Firefox MV3 rejects self-signed HTTPS from extension contexts more
  // strictly than Chrome. If we're on Firefox and the URL is HTTPS on
  // loopback, prefer HTTP on loopback directly (safe — loopback only).
  let effectiveUrl = url
  let usedFallback = false
  if (isFirefox() && parsed.protocol === 'https:' && isLoopbackHost(parsed.hostname)) {
    effectiveUrl = buildHttpFallbackUrl(url)
    usedFallback = true
  }

  const requestHeaders = {
    Authorization: `Bearer ${token}`,
    'X-Obsidian-API-Version': '4',
    ...headers,
  }
  if (body !== null && body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json'
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response
  try {
    response = await fetch(effectiveUrl, {
      method,
      headers: requestHeaders,
      body: body !== null && body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    // If we haven't tried HTTP fallback yet and this looks like a TLS error,
    // retry with HTTP (mirrors the server's fallback logic).
    if (!usedFallback && parsed.protocol === 'https:' && isTlsError(err)) {
      const httpUrl = buildHttpFallbackUrl(url)
      if (httpUrl !== effectiveUrl) {
        const controller2 = new AbortController()
        const timer2 = setTimeout(() => controller2.abort(), timeoutMs)
        try {
          response = await fetch(httpUrl, {
            method,
            headers: requestHeaders,
            body: body !== null && body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller2.signal,
          })
          clearTimeout(timer2)
        } catch (err2) {
          clearTimeout(timer2)
          throw new Error(`Obsidian HTTP fallback also failed: ${err2.message}`)
        }
      } else {
        throw err
      }
    } else {
      throw new Error(`Obsidian request failed: ${err.message}`)
    }
  }

  clearTimeout(timer)
  const text = await response.text()
  return { status: response.status, body: text, ok: response.ok }
}

/**
 * Check if a hostname is a loopback address.
 * @param {string} hostname
 * @returns {boolean}
 */
function isLoopbackHost(hostname) {
  const h = hostname.toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]'
}

export { buildHttpFallbackUrl, isTlsError, isLoopbackHost }