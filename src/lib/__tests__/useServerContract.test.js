// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../../lib/serverContract.js', () => ({
  getServerContract: vi.fn(),
  invalidateServerContract: vi.fn(),
  FAIL_CLOSED: {
    version: null, instanceId: null, deploymentLocality: null,
    mcp: { available: false, enabled: false, tools: 0 },
    vault: { available: false }, notifications: { available: false },
    agentIdentity: { available: false, mode: 'single-key' },
    stale: false, resolved: false,
  },
}))

const { getServerContract } = await import('../../lib/serverContract.js')
const { default: useServerContract } = await import('../../popup/hooks/useServerContract.js')

const APPLIANCE = {
  version: '2.40.4', instanceId: 'self_hosted', deploymentLocality: 'local',
  mcp: { available: true, enabled: true, tools: 40 },
  vault: { available: true }, notifications: { available: true },
  agentIdentity: { available: true, mode: 'named-keys' },
  stale: false, resolved: true,
}

// @testing-library/react is NOT installed in this repo (SaveCard.test.jsx says so in
// its own header), and there is no vitest config file — hence the jsdom pragma above
// and this hand-rolled probe instead of renderHook(). Do not add a dependency to make
// a test prettier.
function renderProbe(hook) {
  const seen = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const Probe = () => { seen.push(hook()); return null }
  return {
    seen,
    get current() { return seen[seen.length - 1] },
    async mount() { await act(async () => { root.render(createElement(Probe)) }) },
    async rerender() { await act(async () => { root.render(createElement(Probe)) }) },
    async unmount() { await act(async () => { root.unmount() }) },
  }
}

describe('useServerContract', () => {
  beforeEach(() => { vi.clearAllMocks(); globalThis.IS_REACT_ACT_ENVIRONMENT = true })

  it('starts fail-closed and unresolved, so no surface flashes on before the manifest lands', async () => {
    // A render that began from "available" would show the Vault tab on cloud for one
    // frame. resolved:false is what lets Popup tell "still loading" from "no".
    getServerContract.mockReturnValue(new Promise(() => {}))          // never settles
    const h = renderProbe(useServerContract)
    await h.mount()
    expect(h.current.resolved).toBe(false)
    expect(h.current.contract.vault.available).toBe(false)
    expect(h.current.contract.mcp.available).toBe(false)
  })

  it('resolves to the contract the module returned', async () => {
    getServerContract.mockResolvedValue(APPLIANCE)
    const h = renderProbe(useServerContract)
    await h.mount()
    expect(h.current.resolved).toBe(true)
    expect(h.current.contract.mcp.available).toBe(true)
    expect(h.current.contract.vault.available).toBe(true)
    expect(h.current.contract.version).toBe('2.40.4')
  })

  it('does not set state after unmount — the popup closes mid-fetch constantly', async () => {
    // The `alive` flag. Without it a late manifest resurrects a surface the user
    // already navigated away from, and React warns in dev.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let settle
    getServerContract.mockReturnValue(new Promise(r => { settle = r }))
    const h = renderProbe(useServerContract)
    await h.mount()
    const rendersBefore = h.seen.length
    await h.unmount()
    await act(async () => { settle(APPLIANCE); await Promise.resolve(); await Promise.resolve() })
    expect(h.seen.length).toBe(rendersBefore)     // no render after unmount
    expect(h.current.resolved).toBe(false)        // never updated
    errSpy.mockRestore()
  })

  it('calls getServerContract once per mount, not once per render', async () => {
    getServerContract.mockResolvedValue(APPLIANCE)
    const h = renderProbe(useServerContract)
    await h.mount()
    await h.rerender()
    expect(getServerContract).toHaveBeenCalledTimes(1)
  })
})
