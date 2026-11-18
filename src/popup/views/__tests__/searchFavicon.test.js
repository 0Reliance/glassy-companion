/**
 * Search results show the bookmark's own icon, never one fetched from a third party.
 * Until 2.21.4 the search view asked www.google.com/s2/favicons for every result's domain.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { faviconFor } from '../SearchView.jsx'

describe('search result icons', () => {
  it('uses the favicon address saved with the bookmark', () => {
    expect(faviconFor({ favicon_url: 'https://example.com/favicon.ico' })).toBe('https://example.com/favicon.ico')
  })
  it('shows no icon when the bookmark has none, or an address that is not http(s)', () => {
    expect(faviconFor({})).toBeNull()
    expect(faviconFor({ favicon_url: 'javascript:alert(1)' })).toBeNull()
    expect(faviconFor(null)).toBeNull()
  })
  it('no source file asks a third-party favicon service', () => {
    const root = path.resolve(__dirname, '../../..')
    const offenders = []
    const walk = d => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name)
        if (e.isDirectory()) { if (e.name !== '__tests__') walk(p) } else if (/\.(js|jsx|html)$/.test(e.name)) {
          if (/google\.com\/s2\/favicons|icons\.duckduckgo\.com|favicone\.com/.test(fs.readFileSync(p, 'utf8'))) offenders.push(p)
        }
      }
    }
    walk(root)
    expect(offenders).toEqual([])
  })
})
