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

  it('merges tags from multiple matching rules without duplicates', () => {
    const result = evaluateRules('https://example.com/docs/api', [
      { domain: 'example.com', tags: ['docs'] },
      { path: '/docs', tags: ['docs', 'reference'] },
    ])
    expect(result.tags).toEqual(['docs', 'reference'])
  })

  it('sets publicCandidate when any matching rule has it', () => {
    const result = evaluateRules('https://example.com/blog', [
      { domain: 'example.com', tags: ['blog'] },
      { path: '/blog', publicCandidate: true, tags: [] },
    ])
    expect(result.publicCandidate).toBe(true)
  })

  it('matches path-only rules regardless of domain', () => {
    const result = evaluateRules('https://anything.io/wiki/page', [
      { path: '/wiki', preset: 'article', destination: 'proj-42' },
    ])
    expect(result.preset).toBe('article')
    expect(result.destination).toBe('proj-42')
  })
})