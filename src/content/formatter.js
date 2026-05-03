/**
 * Glassy Formatter — HTML to Markdown converter.
 * Hand-crafted to produce clean, premium Markdown from DOM nodes.
 */

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
    case 'p': return `${children.trim()}\n\n`
    case 'br': return '\n'
    case 'strong':
    case 'b': return `**${children}**`
    case 'em':
    case 'i': return `*${children}*`
    case 'code': {
      const isBlock = node.parentElement?.tagName === 'PRE'
      return isBlock ? children : `\`${children}\``
    }
    case 'pre': return `\`\`\`\n${children}\`\`\`\n\n`
    case 'a': {
      const href = node.getAttribute('href')
      return href ? `[${children}](${href})` : children
    }
    case 'ul': return `${children}\n`
    case 'ol': {
      let md = ''
      let i = 1
      for (const child of node.children) {
        if (child.tagName === 'LI') {
          md += `${i++}. ${nodeToMarkdown(child).trim()}\n`
        }
      }
      return md + '\n'
    }
    case 'li': return `- ${children.trim()}\n`
    case 'blockquote': return `> ${children.trim().replace(/\n/g, '\n> ')}\n\n`
    case 'img': {
      const alt = node.getAttribute('alt') || 'image'
      const src = node.getAttribute('src')
      return src ? `![${alt}](${src})\n\n` : ''
    }
    case 'hr': return '---\n\n'
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
