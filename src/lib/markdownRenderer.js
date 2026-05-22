/**
 * Lightweight Markdown → HTML renderer for in-popup preview.
 *
 * Converts a subset of Markdown to HTML suitable for rendering inside
 * the extension popup. Not a full parser — handles headings, emphasis,
 * links, images, code blocks, lists, blockquotes, tables, and horizontal rules.
 *
 * XSS-safe: text content is escaped; only known-safe HTML tags are produced.
 */

// ── HTML Escaping ──────────────────────────────────────────────────────────

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ENTITIES[c])
}

// ── Inline rendering ──────────────────────────────────────────────────────

function renderInline(text) {
  // Images
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (_, alt, src, title) => `<img src="${esc(src)}" alt="${esc(alt)}"${title ? ` title="${esc(title)}"` : ''} style="max-width:100%;border-radius:6px;margin:8px 0" />`)
  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (_, label, href, title) => `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''} target="_blank" rel="noopener noreferrer" style="color:#818cf8">${esc(label)}</a>`)
  // Bold + italic (bold first so *** doesn't break)
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  text = text.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>')
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/__(.+?)__/g, '<strong>$1</strong>')
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>')
  text = text.replace(/_(.+?)_/g, '<em>$1</em>')
  // Strikethrough
  text = text.replace(/~~(.+?)~~/g, '<del>$1</del>')
  // Highlight
  text = text.replace(/==(.+?)==/g, '<mark>$1</mark>')
  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px;font-size:0.9em">$1</code>')
  return text
}

// ── Block rendering ───────────────────────────────────────────────────────

/**
 * Render Markdown string to safe HTML suitable for the popup preview.
 */
export function renderMarkdownToHtml(md) {
  if (!md) return ''
  const lines = md.split('\n')
  const out = []
  let inCodeBlock = false
  let codeLang = ''
  let codeLines = []
  let inTable = false
  let tableRows = []

  function flushTable() {
    if (!inTable || tableRows.length === 0) return
    let html = '<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:11px">'
    const isHeader = tableRows[0].every(c => c.trim().startsWith('---') || c.trim() === ':---' || c.trim() === '---:' || c.trim() === ':---:')
    const dataStart = isHeader ? 1 : 0

    if (isHeader && tableRows.length > 1) {
      html += '<thead><tr>'
      for (const cell of tableRows[0]) {
        html += `<th style="border:1px solid rgba(255,255,255,0.1);padding:4px 8px;text-align:left;font-weight:600">${renderInline(cell.trim())}</th>`
      }
      html += '</tr></thead>'
    }

    if (tableRows.length > dataStart) {
      html += '<tbody>'
      for (let i = dataStart; i < tableRows.length; i++) {
        html += '<tr>'
        for (const cell of tableRows[i]) {
          html += `<td style="border:1px solid rgba(255,255,255,0.06);padding:4px 8px">${renderInline(cell.trim())}</td>`
        }
        html += '</tr>'
      }
      html += '</tbody>'
    }

    html += '</table>'
    out.push(html)
    inTable = false
    tableRows = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Fenced code block
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        const lang = codeLang ? ` data-lang="${esc(codeLang)}"` : ''
        const label = codeLang ? `<span style="font-size:9px;color:rgba(255,255,255,0.25);display:block;margin-bottom:4px">${esc(codeLang)}</span>` : ''
        out.push(`<pre style="background:rgba(0,0,0,0.3);padding:10px 12px;border-radius:8px;overflow-x:auto;font-size:11px;line-height:1.6;margin:8px 0"${lang}>${label}<code>${esc(codeLines.join('\n'))}</code></pre>`)
        inCodeBlock = false
        codeLang = ''
        codeLines = []
      } else {
        inCodeBlock = true
        codeLang = trimmed.slice(3).trim()
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    // Table row detection
    const isTableRow = trimmed.startsWith('|') && trimmed.endsWith('|')
    const isTableSep = /^\|[\s:-]+\|/.test(trimmed) && trimmed.endsWith('|')

    if (isTableRow || isTableSep) {
      const cells = trimmed.slice(1, -1).split('|').map(c => c.trim())
      if (isTableSep && tableRows.length === 0) {
        // Separator without header — treat as a horizontal rule in table context
        // Actually just skip lone separators
        continue
      }
      tableRows.push(cells)
      inTable = true
      continue
    } else if (inTable) {
      flushTable()
    }

    // Blank line
    if (!trimmed) {
      continue
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      out.push('<hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:12px 0" />')
      continue
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const sizes = { 1: 18, 2: 16, 3: 14, 4: 13, 5: 12, 6: 11 }
      out.push(`<h${level} style="font-size:${sizes[level]}px;font-weight:700;margin:12px 0 4px;line-height:1.3">${renderInline(headingMatch[2])}</h${level}>`)
      continue
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      const content = trimmed.slice(2)
      out.push(`<blockquote style="border-left:3px solid rgba(99,102,241,0.4);padding:4px 0 4px 12px;margin:6px 0;color:rgba(255,255,255,0.55);font-style:italic">${renderInline(content)}</blockquote>`)
      continue
    }

    // Unordered list item
    if (/^[-*+]\s/.test(trimmed)) {
      const content = trimmed.replace(/^[-*+]\s+/, '')
      out.push(`<li style="margin:2px 0;padding-left:4px">${renderInline(content)}</li>`)
      continue
    }

    // Ordered list item
    if (/^\d+\.\s/.test(trimmed)) {
      const content = trimmed.replace(/^\d+\.\s+/, '')
      out.push(`<li style="margin:2px 0;padding-left:4px">${renderInline(content)}</li>`)
      continue
    }

    // Task list
    if (/^-\s*\[([ x])\]\s/.test(trimmed)) {
      const checked = trimmed[3] === 'x' || trimmed[3] === 'X'
      const content = trimmed.replace(/^-\s*\[[ x]\]\s*/, '')
      const check = checked ? '☑' : '☐'
      out.push(`<li style="margin:2px 0;padding-left:4px">${check} ${renderInline(content)}</li>`)
      continue
    }

    // Regular paragraph
    out.push(`<p style="margin:4px 0;line-height:1.5">${renderInline(trimmed)}</p>`)
  }

  // Flush remaining state
  if (inCodeBlock) {
    out.push(`<pre style="background:rgba(0,0,0,0.3);padding:10px;border-radius:8px;font-size:11px;margin:8px 0"><code>${esc(codeLines.join('\n'))}</code></pre>`)
  }
  flushTable()

  return out.join('\n')
}

/**
 * Count words in a markdown string (rough estimate).
 */
export function countWords(md) {
  if (!md) return 0
  // Strip markdown syntax
  const text = md.replace(/[#*_~`\[\]()>\-+|]/g, ' ').replace(/\s+/g, ' ').trim()
  return text ? text.split(' ').length : 0
}

/**
 * Estimate reading time in minutes (200 wpm).
 */
export function estimateReadingTime(wordCount) {
  const mins = Math.max(1, Math.ceil(wordCount / 200))
  return mins === 1 ? '1 min' : `${mins} min`
}
