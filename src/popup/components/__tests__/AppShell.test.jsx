// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import AppShell, { tabsFor } from '../AppShell.jsx'

describe('tabsFor — the Vault tab is a capability, not a constant', () => {
  it('omits vault when the instance cannot serve it', () => {
    expect(tabsFor({ vaultAvailable: false }).map(t => t.id))
      .toEqual(['save', 'note', 'search', 'kb'])
  })

  it('includes vault, in its original position, when the instance can', () => {
    // Position matters: the order users know is save, note, search, vault, kb.
    expect(tabsFor({ vaultAvailable: true }).map(t => t.id))
      .toEqual(['save', 'note', 'search', 'vault', 'kb'])
  })

  it('defaults to hidden — a caller that forgets the prop fails closed', () => {
    expect(tabsFor().map(t => t.id)).not.toContain('vault')
    expect(tabsFor({}).map(t => t.id)).not.toContain('vault')
  })

  it('does not share one mutable array between calls', () => {
    // splice() on a module-level constant would permanently add a second vault tab.
    const a = tabsFor({ vaultAvailable: true })
    const b = tabsFor({ vaultAvailable: true })
    expect(a).not.toBe(b)
    expect(b.filter(t => t.id === 'vault')).toHaveLength(1)
  })
})

describe('AppShell renders the gate', () => {
  let container, root
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  const props = {
    activeView: 'save', onNavigate: vi.fn(), user: { email: 'a@b.c' },
    showSettings: false, onToggleSettings: vi.fn(),
  }
  // Tab buttons render `<span>{icon}</span>{label}`, so textContent is "📁Vault", not
  // "Vault". An exact-match assertion here passes VACUOUSLY while the tab is still on
  // screen — verified: the first draft of this test went green before tabsFor existed.
  // Match on substring, and keep a positive control so an empty selector cannot lie.
  const labels = () => [...container.querySelectorAll('nav button')].map(b => b.textContent)
  const hasTab = (name) => labels().some(t => t.includes(name))
  const show = async (extra) => {
    await act(async () => {
      root.render(createElement(AppShell, { ...props, ...extra }, createElement('div')))
    })
    // Positive control: the tab bar really rendered. Without this, every negative
    // assertion below would also pass against an empty document.
    expect(labels().length).toBeGreaterThan(0)
  }

  it('shows no Vault tab on cloud', async () => {
    await show({ vaultAvailable: false })
    expect(hasTab('Vault')).toBe(false)
    expect(hasTab('Save')).toBe(true)
    expect(hasTab('KB')).toBe(true)
  })

  it('shows the Vault tab on an appliance', async () => {
    await show({ vaultAvailable: true })
    expect(hasTab('Vault')).toBe(true)
  })

  it('hides the vault by default when the prop is omitted entirely', async () => {
    await show({})
    expect(hasTab('Vault')).toBe(false)
    expect(hasTab('Save')).toBe(true)
  })

  it('the notifications badge still renders only when there are unread items', async () => {
    // Regression guard: this task rewrites AppShell's props, and the badge is the other
    // conditional in the header. Do not lose it while gating the tabs.
    await show({ unreadNotifications: 3, onOpenNotifications: vi.fn() })
    expect(container.querySelector('[data-testid="notifications-badge"]')).toBeTruthy()

    await show({ unreadNotifications: 0, onOpenNotifications: vi.fn() })
    expect(container.querySelector('[data-testid="notifications-badge"]')).toBeNull()
  })
})
