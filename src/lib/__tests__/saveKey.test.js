import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth.js', () => ({
  getToken: vi.fn(() => Promise.resolve('t')),
  getBaseUrl: vi.fn(() => Promise.resolve('https://glassy.test')),
  getActiveAccountId: vi.fn(() => Promise.resolve(null)),
  getApiContext: vi.fn(() => Promise.resolve({ baseUrl: 'https://glassy.test', activeAccountId: null })),
  clearAuth: vi.fn(),
}))

const { saveNote, saveCapture, createHighlight, fetchMe, stampSaveKey } = await import('../api.js')
const { classifySaveError, planQueueFailure } = await import('../../background/savePolicy.js')

const ok = body => ({ ok: true, status: 201, headers: { get: () => null }, text: async () => JSON.stringify(body) })

describe('one Idempotency-Key per save', () => {
  beforeEach(() => { vi.useRealTimers(); globalThis.fetch = vi.fn() })

  it('sends the key as a header and never in the body', async () => {
    fetch.mockResolvedValueOnce(ok({ id: 'n1' }))
    const payload = { content: 'hello' }
    await saveNote(payload)
    const [, init] = fetch.mock.calls[0]
    expect(init.headers['Idempotency-Key']).toMatch(/^gc-/)
    expect(JSON.parse(init.body)).toEqual({ content: 'hello' })
  })

  it('a retry after a network error sends the same key', async () => {
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fetch.mockResolvedValueOnce(ok({ id: 'c1' }))
    await saveCapture({ sourceUrl: 'https://a.test' })
    const keys = fetch.mock.calls.map(([, init]) => init.headers['Idempotency-Key'])
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  it('the queued copy carries the key, so a later replay sends the same one', async () => {
    const payload = { text: 'passage' }
    fetch.mockResolvedValueOnce(ok({ id: 1 }))
    await createHighlight(7, payload)
    const first = fetch.mock.calls[0][1].headers['Idempotency-Key']
    const replay = JSON.parse(JSON.stringify(payload)) // what chrome.storage gives back
    fetch.mockResolvedValueOnce(ok({ id: 1 }))
    await createHighlight(7, replay)
    expect(fetch.mock.calls[1][1].headers['Idempotency-Key']).toBe(first)
  })

  it('two different saves get two keys; reads get none', async () => {
    const a = stampSaveKey({}), b = stampSaveKey({})
    expect(a._idempotencyKey).not.toBe(b._idempotencyKey)
    fetch.mockResolvedValueOnce(ok({ user: {} }))
    await fetchMe()
    expect(fetch.mock.calls[0][1].headers['Idempotency-Key']).toBeUndefined()
  })

  it('a save still on its way is retried later, not dropped as a duplicate', () => {
    const inProgress = { status: 409, body: { code: 'REQUEST_IN_PROGRESS' } }
    expect(classifySaveError(inProgress)).toBe('retryable')
    expect(planQueueFailure(inProgress).action).toBe('retry')
    expect(classifySaveError({ status: 409, body: { error: 'Already saved' } })).toBe('duplicate')
  })
})
