import { describe, expect, it } from 'vitest'
import { draftFor, withDraft, withoutDraft } from '../saveDrafts.js'

describe('save drafts are kept per page', () => {
  it('DRAFTS-1: a draft for page A survives writing one for page B', () => {
    let s = withDraft(null, 'https://a.example/', { notes: 'typed on A', savedAt: 1 })
    s = withDraft(s, 'https://b.example/', { notes: '', savedAt: 2 })
    expect(draftFor(s, 'https://a.example/').notes).toBe('typed on A')
    expect(draftFor(s, 'https://b.example/').notes).toBe('')
  })
  it('DRAFTS-2: the older single-draft shape is still read, and only for its own page', () => {
    const old = { url: 'https://a.example/', title: 'Old', savedAt: 5 }
    expect(draftFor(old, 'https://a.example/').title).toBe('Old')
    expect(draftFor(old, 'https://b.example/')).toBeNull()
    const s = withDraft(old, 'https://b.example/', { title: 'B', savedAt: 6 })
    expect(draftFor(s, 'https://a.example/').title).toBe('Old')
  })
  it('DRAFTS-3: only the newest are kept', () => {
    let s = null
    for (let i = 0; i < 5; i++) s = withDraft(s, `https://p${i}.example/`, { savedAt: i }, 3)
    expect(Object.keys(s.byUrl).sort()).toEqual(['https://p2.example/', 'https://p3.example/', 'https://p4.example/'])
  })
  it('DRAFTS-4: removing the last draft leaves nothing', () => {
    const s = withDraft(null, 'https://a.example/', { savedAt: 1 })
    expect(withoutDraft(s, 'https://a.example/')).toBeNull()
    const t = withDraft(s, 'https://b.example/', { savedAt: 2 })
    expect(Object.keys(withoutDraft(t, 'https://a.example/').byUrl)).toEqual(['https://b.example/'])
  })
})
