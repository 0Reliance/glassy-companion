/**
 * Glassy Companion — Interpreter Registry
 *
 * Detects the current site and dispatches to a specialized interpreter
 * for enriched metadata extraction. Falls back to generic extraction.
 *
 * Interpreters return: { enriched: true, site, contentType, metadata, content? }
 */

import { interpretYouTube } from './youtube.js'
import { interpretGitHub } from './github.js'
import { interpretProduct } from './product.js'
import { interpretArticle } from './article.js'

/** Map hostname patterns to interpreter functions. */
const INTERPRETERS = [
  { pattern: /^(www\.)?youtube\.com$/, fn: interpretYouTube },
  { pattern: /^(www\.)?youtu\.be$/, fn: interpretYouTube },
  { pattern: /^(www\.)?github\.com$/, fn: interpretGitHub },
  { pattern: /^(www\.)?gitlab\.com$/, fn: interpretGitHub },
  { pattern: /^(www\.)?amazon\./, fn: interpretProduct },
  { pattern: /^(www\.)?ebay\.com$/, fn: interpretProduct },
  { pattern: /^(www\.)?producthunt\.com$/, fn: interpretProduct },
  { pattern: /^(www\.)?arxiv\.org$/, fn: interpretArticle },
  { pattern: /^(www\.)?medium\.com$/, fn: interpretArticle },
  { pattern: /^(www\.)?substack\.com$/, fn: interpretArticle },
  { pattern: /^(www\.)?dev\.to$/, fn: interpretArticle },
]

/**
 * Try to interpret the current page with a site-specific interpreter.
 * @returns {Promise<object|null>} enriched data or null if no match.
 */
export async function runInterpreter(url, document) {
  let hostname = ''
  try {
    hostname = new URL(url).hostname
  } catch {
    return null
  }

  for (const { pattern, fn } of INTERPRETERS) {
    if (pattern.test(hostname)) {
      try {
        const result = await fn(document, url)
        if (result) return result
      } catch {
        // interpreter failed — fall back to generic
      }
    }
  }

  return null
}
