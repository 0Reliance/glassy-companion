import { describe, expect, it } from 'vitest'
import { buildMergePatch, describeMerge, mergeTookEffect } from '../saveMerge.js'

describe('Add these to the saved page', () => {
  it('turns what the person chose into additions', () => {
    expect(buildMergePatch({ visibleTags: ['Cooking', ' '], note: ' try lemon ', projectIds: [7] }))
      .toEqual({ add_tags: ['Cooking'], append_note: 'try lemon', collection_id: 7 })
  })
  it('offers nothing when nothing was chosen', () => {
    expect(buildMergePatch({ visibleTags: [], note: '', projectIds: [] })).toBeNull()
    expect(buildMergePatch(null)).toBeNull()
  })
  it('says what it will add', () => {
    expect(describeMerge({ add_tags: ['a', 'b'], append_note: 'x' })).toBe('your 2 tags and your note')
    expect(describeMerge({ add_tags: ['a'] })).toBe('your tag')
    expect(describeMerge({ add_tags: ['a'], append_note: 'x', collection_id: 1 })).toBe('your tag, your note and the collection you picked')
  })
  it('notices an older Glassy that ignored the additions', () => {
    const patch = { add_tags: ['Cooking'], append_note: 'try lemon' }
    expect(mergeTookEffect(patch, { tags: ['cooking'], notes: 'old\n\ntry lemon' })).toBe(true)
    expect(mergeTookEffect(patch, { tags: [], notes: 'old' })).toBe(false)
  })
})
