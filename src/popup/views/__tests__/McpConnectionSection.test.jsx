// @vitest-environment jsdom
/**
 * McpConnectionSection — error classification must be status-based.
 *
 * WHY THIS EXISTS: handleFetch used to decide "is this an entitlement denial?" by
 * matching prose — `msg.includes('403') || msg.includes('not enabled') ||
 * msg.includes('forbidden')`. apiFetch already throws an ApiError carrying `.status`
 * (src/lib/api.js:158), so the authoritative code was available and ignored. That
 * broke in both directions:
 *
 *   false negative — a server that words its 403 differently (no "403" in the text)
 *                    was reported as a network failure, telling the user to check
 *                    their connection when the real answer is "MCP is off here".
 *   false positive — any error whose message merely CONTAINS "403" (a byte count, an
 *                    ID, an echoed note body) was misreported as an entitlement denial.
 *
 * The two central tests below are exactly those cases. Both fail against the old
 * implementation, which is what makes this a regression test rather than a restatement
 * of the code.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

const getMcpToken = vi.fn()

vi.mock('../../../lib/api.js', async (importOriginal) => {
  // Keep the REAL module (so ApiError is the production class, not a stand-in) and
  // override only the two functions that perform network I/O. Overriding the whole
  // module would make `ApiError` undefined at the import below — a bug in the first
  // draft of this test.
  const actual = await importOriginal()
  return {
    ...actual,
    getMcpToken: (...a) => getMcpToken(...a),
    createNamedMcpKey: vi.fn(),
  }
})

vi.mock('../../hooks/useServerContract.js', () => ({
  default: () => ({
    contract: {
      mcp: { available: true, mounted: true },
      agentIdentity: { available: false, mode: 'single-key' },
    },
    loading: false,
    error: null,
  }),
}))

// Imported AFTER the mocks are registered.
const { default: McpConnectionSection } = await import('../McpConnectionSection.jsx')
const { ApiError } = await import('../../../lib/api.js')

const ENTITLEMENT_COPY = 'MCP is not available on this Glassy server'
const GENERIC_COPY = 'Failed to fetch MCP key'

describe('McpConnectionSection classifies errors by status, not by message wording', () => {
  let container, root

  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  /** Render, click "Get MCP Key & Config", and return the resulting error text. */
  const fetchError = async () => {
    await act(async () => {
      root.render(createElement(McpConnectionSection))
    })
    const buttons = [...container.querySelectorAll('button')]
    const fetchBtn = buttons.find(b => b.textContent.includes('Get MCP Key'))
    // Positive control: without this the selector could match nothing and every
    // assertion below would pass against a document that never rendered. This is
    // the vacuous-test trap that AppShell.test.jsx also guards against.
    expect(fetchBtn, 'fetch button did not render').toBeTruthy()

    await act(async () => {
      fetchBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => { await Promise.resolve() })

    const shown = container.textContent
    expect(shown.length).toBeGreaterThan(0)
    if (shown.includes(ENTITLEMENT_COPY)) return 'entitlement'
    if (shown.includes(GENERIC_COPY)) return 'generic-fallback'
    return shown
  }

  it('treats a 403 as an entitlement denial even when the server words it differently', async () => {
    // No "403", no "not enabled", no "forbidden" anywhere in the message. The old
    // string matcher classified this as a network failure.
    getMcpToken.mockRejectedValue(
      new ApiError(403, 'MCP bridge is disabled on this instance', null),
    )
    expect(await fetchError()).toBe('entitlement')
  })

  it('does NOT treat a non-403 as an entitlement denial just because its message contains "403"', async () => {
    // A 500 whose prose happens to include the digits. The old matcher saw "403"
    // and told the user MCP was unavailable — masking a genuine server error.
    getMcpToken.mockRejectedValue(
      new ApiError(500, 'upstream timeout after 403 ms', null),
    )
    const shown = await fetchError()
    expect(shown).not.toBe('entitlement')
    // The real message should survive rather than being replaced by a fallback.
    expect(shown).toContain('upstream timeout after 403 ms')
  })

  it('falls back to the generic copy for a network error that carries no status', async () => {
    // A TypeError from fetch has no .status; it must not be read as a 403.
    getMcpToken.mockRejectedValue(new TypeError('Failed to fetch'))
    const shown = await fetchError()
    expect(shown).not.toBe('entitlement')
    expect(shown).toContain('Failed to fetch')
  })

  it('surfaces the server message for other statuses rather than swallowing it', async () => {
    getMcpToken.mockRejectedValue(new ApiError(401, 'token expired', null))
    const shown = await fetchError()
    expect(shown).not.toBe('entitlement')
    expect(shown).toContain('token expired')
  })
})
