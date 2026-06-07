import { describe, expect, it } from 'vitest'
import { getHostname, sameDocumentUrl, isUnsavableUrl } from '../urlUtils.js'

describe('urlUtils.js', () => {
  describe('getHostname', () => {
    it('extracts hostname from a valid URL', () => {
      expect(getHostname('https://example.com/path?q=1')).toBe('example.com')
    })

    it('returns a friendly fallback for invalid input', () => {
      expect(getHostname('not a url')).toBe('this page')
    })
  })

  describe('sameDocumentUrl', () => {
    it('treats URLs that differ only by hash as the same document', () => {
      expect(sameDocumentUrl('https://a.com/p', 'https://a.com/p#x')).toBe(true)
    })

    it('distinguishes different paths', () => {
      expect(sameDocumentUrl('https://a.com/p', 'https://a.com/q')).toBe(false)
    })
  })

  describe('isUnsavableUrl', () => {
    it('allows ordinary public http(s) URLs', () => {
      expect(isUnsavableUrl('https://example.com/article')).toBe(false)
      expect(isUnsavableUrl('http://news.ycombinator.com')).toBe(false)
    })

    it('blocks non-http(s) schemes', () => {
      expect(isUnsavableUrl('chrome://extensions')).toBe(true)
      expect(isUnsavableUrl('about:blank')).toBe(true)
      expect(isUnsavableUrl('file:///etc/hosts')).toBe(true)
    })

    it('blocks localhost and loopback hosts', () => {
      expect(isUnsavableUrl('http://localhost:3000/x')).toBe(true)
      expect(isUnsavableUrl('http://127.0.0.1:8787/session')).toBe(true)
      expect(isUnsavableUrl('http://0.0.0.0/')).toBe(true)
    })

    it('blocks private IP ranges', () => {
      expect(isUnsavableUrl('http://10.0.0.5/')).toBe(true)
      expect(isUnsavableUrl('http://192.168.1.1/')).toBe(true)
      expect(isUnsavableUrl('http://172.16.0.1/')).toBe(true)
      expect(isUnsavableUrl('http://169.254.1.1/')).toBe(true)
    })

    it('blocks cloud metadata hosts', () => {
      expect(isUnsavableUrl('http://metadata.google.internal/')).toBe(true)
    })

    it('blocks decimal IP notation', () => {
      expect(isUnsavableUrl('http://2130706433/')).toBe(true)
    })

    it('treats malformed URLs as unsavable', () => {
      expect(isUnsavableUrl('definitely not a url')).toBe(true)
    })
  })
})
