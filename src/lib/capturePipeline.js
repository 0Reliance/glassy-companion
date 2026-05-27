/**
 * Capture Pipeline — shared metadata enrichment and Markdown assembly
 *
 * Used by both the service worker (legacy fallback) and the offscreen document
 * so both paths produce identical capture items. This prevents logic drift.
 */

import { assemblePremiumMarkdown } from './premiumMarkdown.js'
import { sameDocumentUrl } from './urlUtils.js'

/**
 * Build a complete capture item by enriching tab metadata if the source URL
 * matches the active tab.
 *
 * @param {object} params
 * @param {object} params.item   — partial capture item from the popup
 * @param {number} [params.tabId]  — active tab ID (or null)
 * @param {string} [params.tabUrl] — active tab URL (or null)
 * @returns {Promise<object>} the enriched capture item ready for saveCapture
 */
export async function buildCaptureItem({ item, tabId, tabUrl }) {
  const captureItem = { ...item }

  // Step 1 — Extract content from content script ONLY if source matches tab
  if (tabId && !captureItem.contentMarkdown) {
    const sourceUrl = captureItem.sourceUrl || captureItem.url
    const canUseTabContent = sourceUrl && tabUrl && sameDocumentUrl(sourceUrl, tabUrl)
    if (canUseTabContent) {
      try {
        const metaRes = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_META' })
        if (metaRes?.meta) {
          Object.assign(captureItem, {
            canonicalUrl: metaRes.meta.canonicalUrl,
            title: captureItem.title === 'Untitled' || !captureItem.title
              ? metaRes.meta.title
              : captureItem.title,
            description: metaRes.meta.description,
            coverImageUrl: metaRes.meta.og_image,
            favicon_url: metaRes.meta.favicon_url,
            siteName: metaRes.meta.siteName,
            author: metaRes.meta.author,
            publishedAt: metaRes.meta.publishedAt,
            contentType: metaRes.meta.contentType,
          })
        }
        if (captureItem.captureMode === 'quick') {
          const contentRes = await chrome.tabs.sendMessage(tabId, { type: 'GET_STRUCTURED_CONTENT' })
          if (contentRes?.markdown) captureItem.contentMarkdown = contentRes.markdown
        }
      } catch { /* Content script not present or tab changed — continue with defaults */ }
    }
  }

  // Step 2 — Defensive defaults
  if (!captureItem.contentType) captureItem.contentType = 'bookmark'

  // Step 3 — Assemble premium Markdown presentation
  captureItem.contentMarkdown = assemblePremiumMarkdown(captureItem)

  return captureItem
}
