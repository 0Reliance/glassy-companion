// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { nodeToMarkdown, formatMarkdown } from '../formatter.js'

describe('formatter.js', () => {
  it('uses resolved URLs for links and images', () => {
    document.body.innerHTML = '<p><a href="/docs">Docs</a></p><img src="/image.png" alt="Cover">'

    const markdown = nodeToMarkdown(document.body)

    expect(markdown).toContain('[Docs](http://localhost:3000/docs)')
    expect(markdown).toContain('![Cover](http://localhost:3000/image.png)')
  })

  it('renders strikethrough, mark, kbd', () => {
    const md = formatMarkdown('<p><del>old</del> <s>gone</s> <mark>hot</mark> press <kbd>Ctrl</kbd></p>')
    expect(md).toContain('~~old~~')
    expect(md).toContain('~~gone~~')
    expect(md).toContain('==hot==')
    expect(md).toContain('<kbd>Ctrl</kbd>')
  })

  it('renders fenced code with detected language', () => {
    const md = formatMarkdown('<pre><code class="language-js">const a = 1;\n</code></pre>')
    expect(md).toMatch(/```js\nconst a = 1;\n```/)
  })

  it('renders fenced code without language when no class hint', () => {
    const md = formatMarkdown('<pre><code>plain\n</code></pre>')
    expect(md).toMatch(/```\nplain\n```/)
  })

  it('renders task list items with checkbox state', () => {
    const md = formatMarkdown('<ul><li><input type="checkbox" checked>Done</li><li><input type="checkbox">Todo</li></ul>')
    expect(md).toContain('- [x] Done')
    expect(md).toContain('- [ ] Todo')
  })

  it('renders ordered lists honoring start attribute', () => {
    const md = formatMarkdown('<ol start="3"><li>third</li><li>fourth</li></ol>')
    expect(md).toContain('3. third')
    expect(md).toContain('4. fourth')
  })

  it('renders tables with header and body rows', () => {
    const md = formatMarkdown(
      '<table><thead><tr><th>Name</th><th>Score</th></tr></thead>' +
      '<tbody><tr><td>Ada</td><td>99</td></tr><tr><td>Linus</td><td>87</td></tr></tbody></table>'
    )
    expect(md).toContain('| Name | Score |')
    expect(md).toContain('| --- | --- |')
    expect(md).toContain('| Ada | 99 |')
    expect(md).toContain('| Linus | 87 |')
  })

  it('renders figure with figcaption as italic line', () => {
    const md = formatMarkdown('<figure><img src="/x.png" alt="X"><figcaption>Plot of X</figcaption></figure>')
    expect(md).toContain('![X](http://localhost:3000/x.png)')
    expect(md).toContain('*Plot of X*')
  })

  it('strips script and style nodes', () => {
    const md = formatMarkdown('<p>visible</p><script>alert(1)</script><style>.x{}</style>')
    expect(md).toContain('visible')
    expect(md).not.toContain('alert(1)')
    expect(md).not.toContain('.x{}')
  })

  it('escapes pipe characters in table cells', () => {
    const md = formatMarkdown('<table><tr><th>a</th></tr><tr><td>x|y</td></tr></table>')
    expect(md).toContain('| x\\|y |')
  })
})
