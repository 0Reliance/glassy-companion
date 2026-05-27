/**
 * Premium Markdown assembly — shared between service worker and offscreen doc.
 * Assembles a rich Markdown header with metadata for any capture item.
 */

export function assemblePremiumMarkdown(item) {
  const dateStr = new Date(item.capturedAt || Date.now()).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  let header = `# ${item.title}\n\n`
  header += `**Source:** [${item.siteName || item.domain || 'Source'}](${item.sourceUrl})\n`
  if (item.author) header += `**Author:** ${item.author}\n`
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

  return header + (item.contentMarkdown || '')
}
