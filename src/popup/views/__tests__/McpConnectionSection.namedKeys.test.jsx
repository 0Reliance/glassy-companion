// @vitest-environment jsdom
/**
 * McpConnectionSection in named-keys mode — every self-host, and Glassy's cloud from the
 * agents-on-cloud release (glassy 5fedcf4), where the plan caps how many keys a person holds.
 *
 * WHY THIS EXISTS: the section said "This appliance supports named agent keys" and mapped
 * every 403 to "use the one key above", which on the cloud is wrong twice: it is not an
 * appliance, and a 403 there usually means the plan's limit (AGENT_KEY_LIMIT), whose own
 * sentence says what to do. These tests pin the words and that the plan's sentence reaches
 * the person unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

const createNamedMcpKey = vi.fn()

vi.mock('../../../lib/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getMcpToken: vi.fn(),
    createNamedMcpKey: (...a) => createNamedMcpKey(...a),
  }
})

vi.mock('../../hooks/useServerContract.js', () => ({
  default: () => ({
    contract: {
      mcp: { available: true, mounted: true },
      agentIdentity: { available: true, mode: 'named-keys' },
    },
    loading: false,
    error: null,
  }),
}))

const { default: McpConnectionSection } = await import('../McpConnectionSection.jsx')
const { ApiError } = await import('../../../lib/api.js')

const CAP_SENTENCE = 'You can connect 2 agents on the free plan. Turn one off to add another, or get Pro for up to 10.'

describe('McpConnectionSection, named-keys mode', () => {
  let container, root

  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  const render = async () => {
    await act(async () => { root.render(createElement(McpConnectionSection)) })
  }

  const clickMake = async () => {
    const btn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Make a key for an assistant'))
    expect(btn, 'make-key button did not render').toBeTruthy()
    await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await act(async () => { await Promise.resolve() })
  }

  it('offers a key for an assistant in plain words, with no "appliance" or "mint"', async () => {
    await render()
    const text = container.querySelector('[data-testid="named-key-section"]')?.textContent || ''
    expect(text).toContain('Make a key for an assistant')
    expect(text.toLowerCase()).not.toContain('appliance')
    expect(text.toLowerCase()).not.toContain('mint')
  })

  it("shows the plan's own sentence when the cloud says the limit is reached", async () => {
    createNamedMcpKey.mockRejectedValue(new ApiError(403, 'AGENT_KEY_LIMIT', { error: 'AGENT_KEY_LIMIT', message: CAP_SENTENCE }))
    await render()
    await clickMake()
    expect(container.textContent).toContain(CAP_SENTENCE)
    expect(container.textContent).not.toContain('one key above')
  })

  it('still explains a server that does not make named keys', async () => {
    createNamedMcpKey.mockRejectedValue(new ApiError(403, 'FEATURE_NOT_AVAILABLE', { error: 'FEATURE_NOT_AVAILABLE' }))
    await render()
    await clickMake()
    expect(container.textContent).toContain('doesn’t make a key for each assistant yet')
  })
})
