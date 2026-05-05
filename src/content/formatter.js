/**
 * Glassy Formatter — HTML to Markdown converter.
 * Hand-crafted to produce clean, premium Markdown from DOM nodes.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

function detectCodeLanguage(node) {
  // Common conventions: <pre><code class="language-js">, hljs hljs-javascript,
  // prismjs language-ts, etc. We extract the first matching token.
  const code = node.querySelector?.('code')
  const cls = (code?.className || node.className || '').toString()
  const m = cls.match(/(?:language|lang|hljs)-([a-z0-9+#.-]+)/i)
  return m ? m[1].toLowerCase() : ''
}

function isTaskListItem(node) {
  if (node.tagName !== 'LI') return null
  const cb = node.querySelector(':scope > input[type="checkbox"]')
  if (!cb) return null
  return cb.checked ? 'x' : ' '
}

function tableToMarkdown(node) {
  const rows = []
  let headerRow = null

  const allRows = node.querySelectorAll(':scope > thead > tr, :scope > tbody > tr, :scope > tr')
  for (const tr of allRows) {
    const cells = []
    for (const cell of tr.children) {
      if (cell.tagName !== 'TD' && cell.tagName !== 'TH') continue
      const inner = Array.from(cell.childNodes).map(nodeToMarkdown).join('').trim()
      cells.push(inner.replace(/\n+/g, ' ').replace(/\|/g, '\\|'))
    }
    if (!cells.length) continue
    if (!headerRow && tr.querySelector(':scope > th')) headerRow = cells
    else rows.push(cells)
  }

  if (!headerRow && rows.length) {
    headerRow = rows.shift()
  }
  if (!headerRow) return ''

  const colCount = Math.max(headerRow.length, ...rows.map(r => r.length))
  const pad = (cells) => {
    const padded = [...cells]
    while (padded.length < colCount) padded.push('')
    return padded
  }

  let out = `| ${pad(headerRow).join(' | ')} |\n`
  out += `| ${pad(headerRow).map(() => '---').join(' | ')} |\n`
  for (const row of rows) out += `| ${pad(row).join(' | ')} |\n`
  return out + '\n'
}

// ── Main converter ───────────────────────────────────────────────────────────

export function nodeToMarkdown(node) {
  if (!node) return ''

  // Handle text nodes
  if (node.nodeType === 3) {
    return node.textContent
  }

  // Handle element nodes
  if (node.nodeType !== 1) return ''

  const tag = node.tagName.toLowerCase()
  let children = ''

  // Recursively process children
  for (const child of node.childNodes) {
    children += nodeToMarkdown(child)
  }

  switch (tag) {
    case 'h1': return `# ${children.trim()}\n\n`
    case 'h2': return `## ${children.trim()}\n\n`
    case 'h3': return `### ${children.trim()}\n\n`
    case 'h4': return `#### ${children.trim()}\n\n`
    case 'h5': return `##### ${children.trim()}\n\n`
    case 'h6': return `###### ${children.trim()}\n\n`
    case 'p': return `${children.trim()}\n\n`
    case 'br': return '\n'
    case 'strong':
    case 'b': return `**${children}**`
    case 'em':
    case 'i': return `*${children}*`
    case 'del':
    case 's':
    case 'strike': return `~~${children}~~`
    case 'mark': return `==${children}==`
    case 'kbd': return `<kbd>${children}</kbd>`
    case 'sup': return `<sup>${children}</sup>`
    case 'sub': return `<sub>${children}</sub>`
    case 'code': {
      const isBlock = node.parentElement?.tagName === 'PRE'
      return isBlock ? children : `\`${children}\``
    }
    case 'pre': {
      const lang = detectCodeLanguage(node)
      const body = children.replace(/\n+$/, '')
      return `\`\`\`${lang}\n${body}\n\`\`\`\n\n`
    }
    case 'a': {
      const href = node.href || node.getAttribute('href')
      return href ? `[${children}](${href})` : children
    }
    case 'ul': return `${children}\n`
    case 'ol': {
      let md = ''
      const start = parseInt(node.getAttribute('start') || '1', 10) || 1
      let i = start
      for (const child of node.children) {
        if (child.tagName === 'LI') {
          // Render the LI inline so nested lists stay attached.
          const liBody = nodeToMarkdown(child).replace(/^- /, '').trimEnd()
          md += `${i++}. ${liBody}\n`
        }
      }
      return md + '\n'
    }
    case 'li': {
      const task = isTaskListItem(node)
      const prefix = task !== null ? `- [${task}] ` : '- '
      // Indent any nested list output so it nests correctly under this item.
      const body = children.trim().replace(/\n(?=- |\d+\. )/g, '\n  ')
      return `${prefix}${body}\n`
    }
    case 'blockquote': return `> ${children.trim().replace(/\n/g, '\n> ')}\n\n`
    case 'figure': {
      // Strip outer figure wrapper but preserve caption as italic line below.
      const caption = node.querySelector(':scope > figcaption')
      const captionMd = caption ? `*${Array.from(caption.childNodes).map(nodeToMarkdown).join('').trim()}*\n\n` : ''
      // Walk children but skip the figcaption (we appended it).
      let inner = ''
      for (const child of node.childNodes) {
        if (child.nodeType === 1 && child.tagName === 'FIGCAPTION') continue
        inner += nodeToMarkdown(child)
      }
      return `${inner.trim()}\n\n${captionMd}`
    }
    case 'figcaption': return `*${children.trim()}*\n\n`
    case 'picture': {
      // <picture> usually wraps an <img>; just use the inner img.
      const img = node.querySelector('img')
      return img ? nodeToMarkdown(img) : ''
    }
    case 'img': {
      const alt = node.getAttribute('alt') || 'image'
      const src = node.src || node.getAttribute('src')
      return src ? `![${alt}](${src})\n\n` : ''
    }
    case 'table': return tableToMarkdown(node)
    case 'thead':
    case 'tbody':
    case 'tfoot':
    case 'tr':
    case 'td':
    case 'th':
      // Table cells are handled inside tableToMarkdown; bare occurrences
      // outside a <table> fall through to children to avoid losing content.
      return children
    case 'hr': return '---\n\n'
    case 'script':
    case 'style':
    case 'noscript':
      return ''
    default: return children
  }
}

/**
 * Converts an HTML string or DOM element into clean Markdown.
 */
export function formatMarkdown(input) {
  let root = input
  if (typeof input === 'string') {
    const parser = new DOMParser()
    const doc = parser.parseFromString(input, 'text/html')
    root = doc.body
  }

  return nodeToMarkdown(root).trim()
}
