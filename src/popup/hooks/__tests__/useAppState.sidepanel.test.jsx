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
vi.mock('../../../lib/api.js', () => ({ fetchCaptureRules: vi.fn(async () => ({ rules: [] })) }))
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
  bridge.checkDuplicateUrl.mockClear()
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
})
