/**
 * Obsidian Push — push captures from the browser extension directly to the
 * user's Obsidian vault via the Local REST API. The extension runs on the
 * user's host and can reach 127.0.0.1:27124 directly, so no server round-trip
 * is needed for this direction.
 *
 * Flow:
 *   1. User saves a capture via the extension popup (existing save flow)
 *   2. If Obsidian bridge is enabled AND user has "Push to Obsidian" checked
 *      → extension POSTs to Obsidian's /vault/ endpoint directly
 *   3. Extension records the push metadata on the capture and sends it to
 *      Glassy server as part of the capture's `obsidian` field
 */

import { obsidianFetch } from './obsidianFetch.js'
import { getBridgeSettings } from './obsidianBridge.js'

/**
 * Push a capture (bookmark/note/highlight) to the Obsidian vault as a
 * markdown file. Uses the Obsidian Local REST API's PUT /vault/ endpoint.
 *
 * @param {Object} capture - The capture item to push
 * @param {string} capture.title - Note title
 * @param {string} capture.contentMarkdown - Markdown body
 * @param {string[]} [capture.tags] - Tags to add as frontmatter
 * @param {string} [capture.sourceUrl] - Source URL (for reference)
 * @param {string} [capture.capturedAt] - ISO timestamp of capture
 * @param {string} [targetPath] - Optional vault path (default: Glassy/Clips/)
 * @returns {Promise<{ok: boolean, path: string|null, error: string|null}>}
 */
export async function pushCaptureToVault(capture, targetPath = 'Glassy/Clips/') {
  const settings = await getBridgeSettings()
  if (!settings.enabled || !settings.url || !settings.token) {
    return { ok: false, path: null, error: 'Obsidian bridge not configured' }
  }

  // Build a safe filename from the title
  const safeName = sanitizeFilename(capture.title || 'untitled')
  const timestamp = new Date().toISOString().slice(0, 10)
  const filename = `${safeName}-${timestamp}.md`
  // Ensure targetPath ends with /
  const dir = targetPath.endsWith('/') ? targetPath : targetPath + '/'
  const vaultPath = `${dir}${filename}`

  // Build the markdown content with YAML frontmatter
  const frontmatter = buildFrontmatter(capture)
  const markdown = `---\n${frontmatter}---\n\n# ${capture.title || 'Untitled'}\n\n${capture.contentMarkdown || capture.excerpt || ''}\n`

  // PUT /vault/path with Content-Type: text/markdown
  const url = `${settings.url.replace(/\/$/, '')}/vault/${vaultPath}`
  try {
    const result = await obsidianFetch(url, {
      token: settings.token,
      method: 'PUT',
      body: markdown,
      headers: { 'Content-Type': 'text/markdown' },
      timeoutMs: 15000,
    })
    if (result.ok) {
      return { ok: true, path: vaultPath, error: null }
    }
    return { ok: false, path: null, error: `HTTP ${result.status}: ${result.body.substring(0, 200)}` }
  } catch (err) {
    return { ok: false, path: null, error: err.message }
  }
}

/**
 * Build YAML frontmatter from capture metadata.
 * @param {Object} capture
 * @returns {string}
 */
function buildFrontmatter(capture) {
  const fields = {
    source: 'glassy-companion',
    captured_at: capture.capturedAt || new Date().toISOString(),
  }
  if (capture.sourceUrl) fields.source_url = capture.sourceUrl
  if (capture.tags && capture.tags.length > 0) {
    fields.tags = `[${capture.tags.join(', ')}]`
  }

  let yaml = ''
  for (const [key, value] of Object.entries(fields)) {
    yaml += `${key}: ${value}\n`
  }
  return yaml
}

/**
 * Sanitize a string into a valid filename for Obsidian.
 * @param {string} name
 * @returns {string}
 */
function sanitizeFilename(name) {
  return String(name)
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename chars
    .replace(/\s+/g, '-')         // Spaces to hyphens
    .replace(/-+/g, '-')           // Collapse multiple hyphens
    .replace(/^-|-$/g, '')         // Trim leading/trailing hyphens
    .substring(0, 80)             // Limit length
    || 'untitled'
}

/**
 * Check if push-to-Obsidian is available (bridge enabled + configured).
 * @returns {Promise<boolean>}
 */
export async function isPushAvailable() {
  const settings = await getBridgeSettings()
  return settings.enabled && !!settings.url && !!settings.token
}