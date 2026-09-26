/**
 * Surface-gate guard — an instance-only surface in THIS repo must declare its gate.
 *
 * glassy-dash pins the same rule for its own frontend (capabilitySplitGuard.test.js,
 * Task 0.4), but that scanner walks glassy-dash/src/ only. Its blast radius stops at
 * the repo boundary, which is exactly how the companion's Vault tab shipped ungated
 * while the dashboard hid it correctly on the same rule. The guard belongs where the
 * surface lives.
 *
 * Reads SOURCE with comments stripped, matching how the dash guard already works: a
 * source-scan that matches prose gives a false red the moment someone documents the
 * bug it prevents — and the obvious "fix" (delete the comment) buys a guard that
 * quietly stops covering anything.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { tabsFor } from '../../popup/components/AppShell.jsx'

const ROOT = path.resolve(__dirname, '..', '..', '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

/** Only a `//` that starts a line or follows whitespace begins a comment, so a URL
 *  inside a string literal does not take the rest of the line with it. */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/gm, '$1')
}

describe('instance-only surfaces declare their gate', () => {
  it('the vault is NOT a constant tab — it is produced by the gate', () => {
    // The defect: TABS was a module-level array containing 'vault' unconditionally.
    expect(tabsFor({ vaultAvailable: false }).map(t => t.id)).not.toContain('vault')
    expect(tabsFor({ vaultAvailable: true }).map(t => t.id)).toContain('vault')
  })

  it('AppShell takes vaultAvailable and defaults it to hidden', () => {
    const src = codeOnly(read('src/popup/components/AppShell.jsx'))
    expect(src).toMatch(/vaultAvailable\s*=\s*false/)
    expect(src).toMatch(/tabsFor\(\{\s*vaultAvailable\s*\}\)/)
  })

  it('Popup gates the vault on BOTH the instance capability and the user column', () => {
    // Either alone is the defect class: capability-only shows the vault to a self-host
    // user who never enabled it; column-only shows it on cloud, where the profile
    // column can survive as 1 on an instance that can never serve the feature.
    const src = codeOnly(read('src/popup/Popup.jsx'))
    const decl = src.match(/const vaultAvailable\s*=\s*[^\n]*/)
    expect(decl, 'vaultAvailable declaration not found in Popup.jsx').toBeTruthy()
    expect(decl[0]).toMatch(/contract\.vault\.available/)
    expect(decl[0]).toMatch(/obsidian_enabled/)
  })

  it('every instance-only Settings section is behind a contract check', () => {
    const src = codeOnly(read('src/popup/views/SettingsView.jsx'))
    expect(src).toMatch(/contract\.mcp\.available\s*&&\s*<McpConnectionSection/)
    expect(src).toMatch(/contract\.vault\.available\s*&&\s*<ObsidianBridgeSection/)
    // Bare, ungated renders must not come back.
    expect(src).not.toMatch(/^\s*<McpConnectionSection\s*\/>/m)
    expect(src).not.toMatch(/^\s*<ObsidianBridgeSection\s*\/>/m)
  })

  it('the notifications badge stays gated on the manifest', () => {
    const src = codeOnly(read('src/popup/Popup.jsx'))
    expect(src).toMatch(/contract\.notifications\.available/)
  })

  it('nothing probes /mcp/status again — the manifest is the only source', () => {
    // A positive control on the rule this whole refactor exists to enforce. If someone
    // reintroduces a per-feature availability probe, this fails and names the file.
    const offenders = []
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`
        if (e.isDirectory()) { if (e.name !== '__tests__') walk(rel); continue }
        if (!/\.jsx?$/.test(e.name)) continue
        if (/\/mcp\/status|interpretStatus/.test(codeOnly(read(rel)))) offenders.push(rel)
      }
    }
    walk('src')
    expect(offenders, `availability probe reintroduced in: ${offenders.join(', ')}`).toEqual([])
  })

  it('no component fetches obsidian status directly — liveness goes through the cache', () => {
    // Four components each fetched getObsidianStatus() on mount; one popup open meant
    // four round trips. Only lib/obsidianStatus.js may import it now.
    const offenders = []
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`
        if (e.isDirectory()) { if (e.name !== '__tests__') walk(rel); continue }
        if (!/\.jsx?$/.test(e.name)) continue
        if (rel === 'src/lib/api.js' || rel === 'src/lib/obsidianStatus.js') continue
        if (/\bgetObsidianStatus\b/.test(codeOnly(read(rel)))) offenders.push(rel)
      }
    }
    walk('src')
    expect(offenders, `direct getObsidianStatus() call in: ${offenders.join(', ')}`).toEqual([])
  })
})
