// @vitest-environment jsdom
/**
 * "Add these to the saved page" (final pass 2026-11-18, A5): saving a page that is already
 * saved no longer drops the tags, note and collection the person just chose.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

const updateBookmark = vi.fn()
vi.mock('../../../lib/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, updateBookmark: (...a) => updateBookmark(...a) }
})
vi.mock('../../hooks/useExtensionBridge.js', () => ({ deleteCapture: vi.fn() }))

const { default: SaveToast } = await import('../SaveToast.jsx')

describe('already saved: add what you chose', () => {
  let container, root
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  const offer = { id: 42, patch: { add_tags: ['cooking', 'weeknight'], append_note: 'try lemon' } }
  const render = async props => act(async () => {
    root.render(createElement(SaveToast, { type: 'duplicate', onDismiss: vi.fn(), ...props }))
  })
  const clickAdd = async () => {
    const btn = [...container.querySelectorAll('button')].find(b => b.textContent.startsWith('Add '))
    expect(btn).toBeTruthy()
    expect(btn.textContent).toBe('Add your 2 tags and your note to the saved page')
    await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await act(async () => { await Promise.resolve() })
  }

  it('offers nothing when there is nothing to add', async () => {
    await render({ mergeOffer: null })
    expect(container.querySelector('[data-testid="merge-offer"]')).toBeNull()
  })

  it('adds them and says so', async () => {
    updateBookmark.mockResolvedValue({ tags: ['cooking', 'weeknight'], notes: 'old\n\ntry lemon' })
    await render({ mergeOffer: offer })
    await clickAdd()
    expect(updateBookmark).toHaveBeenCalledWith(42, offer.patch)
    expect(container.textContent).toContain('Added to the saved page.')
  })

  it('tells the truth when an older Glassy ignored them', async () => {
    updateBookmark.mockResolvedValue({ tags: [], notes: 'old' })
    await render({ mergeOffer: offer })
    await clickAdd()
    expect(container.textContent).toContain('This Glassy is too old to add to a saved page.')
  })

  it('says nothing changed when the request fails', async () => {
    updateBookmark.mockRejectedValue(new Error('down'))
    await render({ mergeOffer: offer })
    await clickAdd()
    expect(container.textContent).toContain('the saved page is unchanged')
  })
})
