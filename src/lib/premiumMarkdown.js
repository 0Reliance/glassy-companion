/**
 * Premium Markdown assembly — shared between service worker and offscreen doc.
 * Assembles a rich Markdown header with metadata for any capture item.
 */

export function assemblePremiumMarkdown(item) {
  let body = item.contentMarkdown || ''

  // Idempotency guard — if this body was already assembled (a previous pass
  // prepended the premium header), do not prepend a second header. This keeps
  // the function safe to call from multiple save paths without doubling.
  if (item.title && body.startsWith(`# ${item.title}\n`) && /\n\*\*Source:\*\*/.test(body)) {
    return body
  }

  // Strip a leading duplicate H1 coming from page-extracted content so the
  // metadata title is not rendered twice (page H1 + premium H1).
  if (item.title) {
    const leadingH1 = body.match(/^#\s+(.+?)\s*\n+/)
    if (leadingH1 && normalizeHeading(leadingH1[1]) === normalizeHeading(item.title)) {
      body = body.slice(leadingH1[0].length)
    }
  }

  const dateStr = new Date(item.capturedAt || Date.now()).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  let header = `# ${item.title}\n\n`
  header += `**Source:** [${item.siteName || item.domain || 'Source'}](${item.sourceUrl})\n`
  if (item.canonicalUrl && item.canonicalUrl !== item.sourceUrl) {
    header += `**Canonical:** ${item.canonicalUrl}\n`
  }
  if (item.author) header += `**Author:** ${item.author}\n`
  if (item.publishedAt) header += `**Published:** ${item.publishedAt}\n`
  header += `**Captured on:** ${dateStr}\n\n`

  if (item.note) {
    header += `### Personal Note\n\n${item.note}\n\n---\n\n`
  }

  if (item.highlights?.length) {
    header += `### Highlights\n\n`
    item.highlights.forEach(h => {
      header += `> ${h.text.replace(/\n/g, '\n> ')}\n\n`
    })
    header += `---\n\n`
  }

  return header + body
}

function normalizeHeading(text) {
  return String(text).trim().toLowerCase().replace(/\s+/g, ' ')
}
