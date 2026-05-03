// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { nodeToMarkdown } from '../formatter.js'

describe('formatter.js', () => {
  it('uses resolved URLs for links and images', () => {
    document.body.innerHTML = '<p><a href="/docs">Docs</a></p><img src="/image.png" alt="Cover">'

    const markdown = nodeToMarkdown(document.body)

    expect(markdown).toContain('[Docs](http://localhost:3000/docs)')
    expect(markdown).toContain('![Cover](http://localhost:3000/image.png)')
  })
})