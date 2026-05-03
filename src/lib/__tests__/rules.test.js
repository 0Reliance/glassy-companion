import { describe, expect, it } from 'vitest'
import { evaluateRules } from '../rules.js'

describe('evaluateRules', () => {
  it('requires both domain and path to match when both are provided', () => {
    const result = evaluateRules('https://other.example/docs/post', [
      { domain: 'example.com', path: '/docs', preset: 'article', tags: ['docs'] },
    ])

    expect(result).toEqual({
      preset: null,
      destination: null,
      tags: [],
      publicCandidate: false,
    })
  })

  it('matches exact domains and subdomains without matching lookalike suffixes', () => {
    const result = evaluateRules('https://blog.example.com/posts/1', [
      { domain: 'example.com', preset: 'article', tags: ['trusted'] },
      { domain: 'badexample.com', preset: 'product', tags: ['wrong'] },
    ])

    expect(result.preset).toBe('article')
    expect(result.tags).toEqual(['trusted'])
  })

  it('returns defaults for invalid URLs', () => {
    expect(evaluateRules('not a url', [{ path: '/', tags: ['x'] }])).toEqual({
      preset: null,
      destination: null,
      tags: [],
      publicCandidate: false,
    })
  })
})