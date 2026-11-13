// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import TagEditor from '../TagEditor.jsx'

beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; globalThis.chrome = { storage: { local: { get: async () => ({}), set: async () => {} } }, runtime: { sendMessage: vi.fn() } } })

describe('the tag-suggestion switch', () => {
  it('SWITCH-1: is a keyboard-reachable switch with a plain name and says on or off', async () => {
    const onToggle = vi.fn()
    const c = document.createElement('div'); document.body.appendChild(c)
    const root = createRoot(c)
    await act(async () => { root.render(createElement(TagEditor, { tags: [], onChange: () => {}, aiTag: true, onToggleAi: onToggle })) })
    const sw = c.querySelector('[role="switch"]')
    expect(sw).not.toBeNull()
    expect(sw.tagName).toBe('BUTTON')
    expect(sw.getAttribute('aria-checked')).toBe('true')
    expect(sw.textContent).toMatch(/Add tags for me on/)
    expect(c.textContent).not.toMatch(/AI auto-tag/)
    await act(async () => { sw.click() })
    expect(onToggle).toHaveBeenCalledTimes(1)
    await act(async () => root.unmount())
  })
})
