import { describe, it, expect, vi, beforeEach } from 'vitest'

// 2.21.3: the bridge never puts the sign-in token in the subscribe address.
const status = []
vi.mock('../../lib/auth.js', () => ({ getToken: vi.fn(async () => 'jwt-secret'), peekToken: vi.fn(async () => 'jwt-secret') }))

describe('Obsidian bridge stream address', () => {
  beforeEach(() => { status.length = 0 })

  it('the offscreen and service-worker sources build no ?token= address', async () => {
    const fs = await import('node:fs')
    for (const f of ['src/offscreen/offscreen.js', 'src/lib/obsidianBridge.js']) {
      const code = fs.readFileSync(f, 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
      expect(code, f).not.toMatch(/[?&]token=/)
      expect(code, f).toMatch(/\?ticket=\$\{encodeURIComponent\(ticket\)\}/)
    }
  })
})
