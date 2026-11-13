// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

const bridge = vi.hoisted(() => ({
  checkAuth: vi.fn(async () => ({ authenticated: true, user: { id: 1 } })),
  getActiveTabMeta: vi.fn(),
  checkDuplicateUrl: vi.fn(async () => ({ saved: false })),
}))
vi.mock('../useExtensionBridge.js', () => bridge)
vi.mock('../../../lib/api.js', () => ({ fetchCaptureRules: vi.fn(async () => ({ rules: [{ id: 'r' }] })) }))
const rules = vi.hoisted(() => ({
  evaluateRules: vi.fn(url => (url.includes('recipes') ? { preset: null, destination: 7, tags: ['food'], publicCandidate: false } : { preset: null, destination: null, tags: [], publicCandidate: false })),
  toRulesArray: r => (Array.isArray(r) ? r : r?.rules || []),
}))
vi.mock('../../../lib/rules.js', () => rules)
vi.mock('../../../lib/sessionWatch.js', () => ({ watchSessionEnd: () => () => {} }))

import useAppState, { isSidePanel } from '../useAppState.js'

function makeChrome() {
  const listeners = { activated: [], updated: [] }
  globalThis.chrome = {
    tabs: {
      onActivated: { addListener: fn => listeners.activated.push(fn), removeListener: fn => { listeners.activated = listeners.activated.filter(f => f !== fn) } },
      onUpdated: { addListener: fn => listeners.updated.push(fn), removeListener: fn => { listeners.updated = listeners.updated.filter(f => f !== fn) } },
    },
    storage: {
      session: { get: (_k, cb) => cb({}), remove: () => {} },
      local: { get: async () => ({}), remove: async () => {} },
    },
  }
  return listeners
}

let state, root, container
function Probe() { state = useAppState(); return null }

async function mount() {
  container = document.createElement('div'); document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(createElement(Probe)) })
  await act(async () => { await new Promise(r => setTimeout(r, 0)) })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useRealTimers()
  bridge.getActiveTabMeta.mockReset()
  bridge.checkDuplicateUrl.mockReset(); bridge.checkDuplicateUrl.mockResolvedValue({ saved: false })
})
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); window.history.pushState({}, '', '/') })

describe('the side panel follows the page you are on', () => {
  it('SIDEPANEL-1: reads the page again when the active tab changes', async () => {
    window.history.pushState({}, '', '/src/sidepanel/index.html')
    const listeners = makeChrome()
    bridge.getActiveTabMeta
      .mockResolvedValueOnce({ meta: { url: 'https://one.example/a', title: 'One' } })
      .mockResolvedValueOnce({ meta: { url: 'https://two.example/b', title: 'Two' } })
    await mount()
    expect(isSidePanel()).toBe(true)
    expect(state.pageMeta.url).toBe('https://one.example/a')
    expect(listeners.activated).toHaveLength(1)
    await act(async () => { listeners.activated[0]({ tabId: 2 }); await new Promise(r => setTimeout(r, 300)) })
    expect(state.pageMeta.url).toBe('https://two.example/b')
    expect(bridge.checkDuplicateUrl).toHaveBeenLastCalledWith('https://two.example/b')
  })

  it('SIDEPANEL-2: a page that finishes loading in the active tab is read again; a background tab is not', async () => {
    window.history.pushState({}, '', '/src/sidepanel/index.html')
    const listeners = makeChrome()
    bridge.getActiveTabMeta
      .mockResolvedValueOnce({ meta: { url: 'https://one.example/a' } })
      .mockResolvedValueOnce({ meta: { url: 'https://one.example/next' } })
    await mount()
    await act(async () => { listeners.updated[0](5, { status: 'complete' }, { active: false }); await new Promise(r => setTimeout(r, 300)) })
    expect(bridge.getActiveTabMeta).toHaveBeenCalledTimes(1)
    await act(async () => { listeners.updated[0](5, { status: 'loading' }, { active: true }); await new Promise(r => setTimeout(r, 300)) })
    expect(bridge.getActiveTabMeta).toHaveBeenCalledTimes(1)
    await act(async () => { listeners.updated[0](5, { status: 'complete' }, { active: true }); await new Promise(r => setTimeout(r, 300)) })
    expect(state.pageMeta.url).toBe('https://one.example/next')
  })

  it('SIDEPANEL-3: the popup does not listen (it closes on its own)', async () => {
    window.history.pushState({}, '', '/src/popup/index.html')
    const listeners = makeChrome()
    bridge.getActiveTabMeta.mockResolvedValue({ meta: { url: 'https://one.example/a' } })
    await mount()
    expect(isSidePanel()).toBe(false)
    expect(listeners.activated).toHaveLength(0)
    expect(listeners.updated).toHaveLength(0)
  })

  it('SIDEPANEL-4: closing the panel removes its listeners', async () => {
    window.history.pushState({}, '', '/src/sidepanel/index.html')
    const listeners = makeChrome()
    bridge.getActiveTabMeta.mockResolvedValue({ meta: { url: 'https://one.example/a' } })
    await mount()
    await act(async () => root.unmount()); root = null
    expect(listeners.activated).toHaveLength(0)
    expect(listeners.updated).toHaveLength(0)
  })

  it('SIDEPANEL-5: a slow reading that comes back after a newer one is dropped', async () => {
    window.history.pushState({}, '', '/src/sidepanel/index.html')
    const listeners = makeChrome()
    let releaseSlow
    bridge.getActiveTabMeta
      .mockResolvedValueOnce({ meta: { url: 'https://one.example/a' } })
      .mockImplementationOnce(() => new Promise(r => { releaseSlow = () => r({ meta: { url: 'https://slow.example/b' } }) }))
      .mockResolvedValueOnce({ meta: { url: 'https://fast.example/c' } })
    await mount()
    await act(async () => { listeners.activated[0]({}); await new Promise(r => setTimeout(r, 300)) })
    await act(async () => { listeners.activated[0]({}); await new Promise(r => setTimeout(r, 300)) })
    expect(state.pageMeta.url).toBe('https://fast.example/c')
    await act(async () => { releaseSlow(); await new Promise(r => setTimeout(r, 20)) })
    expect(state.pageMeta.url).toBe('https://fast.example/c')
  })

  it('SIDEPANEL-6: capture rules are worked out for the new page, not carried over', async () => {
    window.history.pushState({}, '', '/src/sidepanel/index.html')
    const listeners = makeChrome()
    bridge.getActiveTabMeta
      .mockResolvedValueOnce({ meta: { url: 'https://site.example/recipes/bread' } })
      .mockResolvedValueOnce({ meta: { url: 'https://news.example/today' } })
    await mount()
    expect(state.ruleDefaults?.projectId).toBe(7)
    await act(async () => { listeners.activated[0]({}); await new Promise(r => setTimeout(r, 300)) })
    expect(state.pageMeta.url).toBe('https://news.example/today')
    expect(state.ruleDefaults).toBeNull()
  })

  it('SIDEPANEL-7: a save in flight is not interrupted; the panel moves on after it, with a clean status', async () => {
    window.history.pushState({}, '', '/src/sidepanel/index.html')
    const listeners = makeChrome()
    bridge.getActiveTabMeta
      .mockResolvedValueOnce({ meta: { url: 'https://one.example/a' } })
      .mockResolvedValue({ meta: { url: 'https://two.example/b' } })
    await mount()
    await act(async () => { state.setSaving() })
    await act(async () => { listeners.activated[0]({}); await new Promise(r => setTimeout(r, 300)) })
    expect(state.pageMeta.url).toBe('https://one.example/a')
    expect(state.saveStatus).toBe('saving')
    await act(async () => { state.setSaved() })
    await act(async () => { await new Promise(r => setTimeout(r, 400)) })
    expect(state.pageMeta.url).toBe('https://two.example/b')
    expect(state.saveStatus).toBe('idle')
  })

  it('SIDEPANEL-8: an "already saved" answer for the old page does not mark the new one', async () => {
    window.history.pushState({}, '', '/src/sidepanel/index.html')
    const listeners = makeChrome()
    let answerOld
    bridge.checkDuplicateUrl
      .mockImplementationOnce(() => new Promise(r => { answerOld = () => r({ saved: true }) }))
      .mockResolvedValue({ saved: false })
    bridge.getActiveTabMeta
      .mockResolvedValueOnce({ meta: { url: 'https://one.example/a' } })
      .mockResolvedValueOnce({ meta: { url: 'https://two.example/b' } })
    await mount()
    await act(async () => { listeners.activated[0]({}); await new Promise(r => setTimeout(r, 300)) })
    await act(async () => { answerOld(); await new Promise(r => setTimeout(r, 20)) })
    expect(state.pageMeta.url).toBe('https://two.example/b')
    expect(state.alreadySaved).toBe(false)
  })
})
