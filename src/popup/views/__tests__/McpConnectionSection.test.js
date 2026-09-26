/**
 * interpretStatus — whether the server's /mcp/status says MCP is actually served.
 *
 * Why this is a function and not `res.ok` (Task 0.3 of the agent safety-net plan):
 * glassy-dash's SPA catch-all answers `200 text/html` for any unknown non-/api path, so
 * on a cloud instance with MCP disabled the probe was `res.ok === true`. The extension
 * then offered an MCP connection that could not work and, on failure, told the user to
 * "ask your admin to set ENABLE_MCP_SERVER=true" — they are not the admin, and cloud MCP
 * is off by design.
 *
 * Task 0.1 makes the SERVER honest (503 + MCP_NOT_MOUNTED when disabled). This makes the
 * CLIENT read the claim instead of the status code, which matters for two independent
 * reasons: an older server image in the field still returns 200 HTML, and `mounted:false`
 * is a thing a 200 can legitimately say while an async mount is still in flight.
 *
 * Availability is a JSON claim, not an HTTP status.
 */
import { describe, it, expect } from 'vitest'

import { interpretStatus } from '../McpConnectionSection.jsx'

const jsonHeaders = { get: () => 'application/json; charset=utf-8' }
const htmlHeaders = { get: () => 'text/html; charset=utf-8' }

describe('interpretStatus', () => {
  it('is false for the SPA catch-all: 200 + text/html, even though res.ok is true', async () => {
    // THE production defect this replaces. `setMcpEnabled(res.ok)` returned true here.
    const res = { ok: true, status: 200, headers: htmlHeaders, json: async () => ({}) }
    expect(await interpretStatus(res)).toBe(false)
  })

  it('is false when the server says MCP is not mounted (503 + MCP_NOT_MOUNTED)', async () => {
    const res = {
      ok: false,
      status: 503,
      headers: jsonHeaders,
      json: async () => ({ error: 'MCP_NOT_MOUNTED', mountState: 'disabled' }),
    }
    expect(await interpretStatus(res)).toBe(false)
  })

  it('is false while a 200 still reports mounted:false (pending or failed attach)', async () => {
    const res = { ok: true, status: 200, headers: jsonHeaders, json: async () => ({ mounted: false }) }
    expect(await interpretStatus(res)).toBe(false)
  })

  it('is true only when a JSON body positively claims mounted', async () => {
    const res = {
      ok: true,
      status: 200,
      headers: jsonHeaders,
      json: async () => ({ mounted: true, toolCount: 40 }),
    }
    expect(await interpretStatus(res)).toBe(true)
  })

  it('is false on a malformed body or an unparseable one, never a throw', async () => {
    expect(await interpretStatus({ ok: true, status: 200, headers: jsonHeaders, json: async () => null })).toBe(false)
    expect(await interpretStatus({ ok: true, status: 200, headers: jsonHeaders, json: async () => { throw new Error('bad json') } })).toBe(false)
    expect(await interpretStatus(undefined)).toBe(false)
  })
})
