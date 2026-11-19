/**
 * "Add these to the saved page" (final pass 2026-11-18, A5).
 *
 * When a person saves a page they already have, the tags, note and collection they just
 * chose used to be dropped: the server answered "already saved" and nothing else
 * happened. This turns what they chose into a PATCH the server (glassy ≥ 2.65.29) adds
 * to the saved page: add_tags joins its tags, append_note goes under its note.
 */

/** @returns {null | { add_tags?: string[], append_note?: string, collection_id?: string|number }} */
export function buildMergePatch(payload) {
  if (!payload || typeof payload !== 'object') return null
  const tags = Array.isArray(payload.visibleTags) ? payload.visibleTags
    : Array.isArray(payload.tags) ? payload.tags : []
  const cleanTags = tags.map(t => String(t).trim()).filter(Boolean)
  const note = String(payload.note ?? payload.notes ?? '').trim()
  const collection = Array.isArray(payload.projectIds) && payload.projectIds[0]
    ? payload.projectIds[0]
    : (payload.collection_id || null)
  const patch = {}
  if (cleanTags.length) patch.add_tags = cleanTags
  if (note) patch.append_note = note
  if (collection) patch.collection_id = collection
  return Object.keys(patch).length ? patch : null
}

/** "your 2 tags and your note" — what the button will add, in plain words. */
export function describeMerge(patch) {
  if (!patch) return ''
  const parts = []
  const n = patch.add_tags?.length || 0
  if (n) parts.push(n === 1 ? 'your tag' : `your ${n} tags`)
  if (patch.append_note) parts.push('your note')
  if (patch.collection_id) parts.push('the collection you picked')
  if (parts.length <= 1) return parts[0] || ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/**
 * Did the server take the additions? A Glassy older than 2.65.29 ignores add_tags and
 * append_note and still answers 200, so check the saved page it sends back.
 */
export function mergeTookEffect(patch, updated) {
  if (!patch || !updated) return false
  if (patch.add_tags?.length) {
    const have = new Set((Array.isArray(updated.tags) ? updated.tags : []).map(t => String(t).toLowerCase()))
    if (!patch.add_tags.every(t => have.has(String(t).trim().toLowerCase()))) return false
  }
  if (patch.append_note && !String(updated.notes || '').includes(patch.append_note)) return false
  return true
}
