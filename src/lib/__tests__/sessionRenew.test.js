import { beforeEach, describe, expect, it, vi } from 'vitest'

function makeJwt(payload) {
  const enc = o => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(payload)}.sig`
}
const now = () => Math.floor(Date.now() / 1000)
const DAY = 24 * 3600

let store
beforeEach(() => {
  store = {}
  const local = {
    get: vi.fn(async keys => {
      const list = typeof keys === 'string' ? [keys] : keys
      return Object.fromEntries(list.map(k => [k, store[k]]))
    }),
    set: vi.fn(async obj => { Object.assign(store, obj) }),
    remove: vi.fn(async k => { delete store[k] }),
  }
  globalThis.chrome = { storage: { local, session: { get: vi.fn(async () => ({})), remove: vi.fn(async () => {}) } } }
  globalThis.fetch = vi.fn()
})

const { renewSessionIfDue, tokenSecondsLeft, RENEW_WHEN_SECONDS_LEFT } = await import('../auth.js')

function respond(status, body) {
  globalThis.fetch.mockResolvedValueOnce({ ok: status >= 200 && status < 300, status, json: async () => body })
}

describe('session renewal', () => {
  it('reads the time left without touching storage', () => {
    expect(tokenSecondsLeft(makeJwt({ exp: 1000 }), 400)).toBe(600)
    expect(tokenSecondsLeft(makeJwt({ uid: 1 }))).toBeNull()
    expect(tokenSecondsLeft(null)).toBeNull()
  })

  it('does nothing while more than ~6 days remain', async () => {
    store.glassy_token = makeJwt({ exp: now() + 7 * DAY - 60 })
    expect(await renewSessionIfDue()).toBe('not-due')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does nothing when signed out', async () => {
    expect(await renewSessionIfDue()).toBe('signed-out')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('swaps a token that is due for the fresh one', async () => {
    const old = makeJwt({ exp: now() + 2 * DAY })
    const fresh = makeJwt({ exp: now() + 7 * DAY })
    store.glassy_token = old
    store.glassy_active_account_id = 'acc_1'
    respond(200, { token: fresh, expiresAt: 'x' })
    expect(await renewSessionIfDue()).toBe('renewed')
    expect(store.glassy_token).toBe(fresh)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toMatch(/\/api\/auth\/renew$/)
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(`Bearer ${old}`)
  })

  it.each([[401, 'refused'], [404, 'unsupported'], [500, 'refused']])('keeps the token on %i', async (status, outcome) => {
    const old = makeJwt({ exp: now() + DAY })
    store.glassy_token = old
    respond(status, { error: 'no', code: 'RENEW_WINDOW_ENDED' })
    expect(await renewSessionIfDue()).toBe(outcome)
    expect(store.glassy_token).toBe(old)
  })

  it('keeps the token when the network fails', async () => {
    const old = makeJwt({ exp: now() + DAY })
    store.glassy_token = old
    fetch.mockRejectedValueOnce(new Error('offline'))
    expect(await renewSessionIfDue()).toBe('failed')
    expect(store.glassy_token).toBe(old)
  })

  it('does not overwrite a sign-in that changed while it waited', async () => {
    const old = makeJwt({ exp: now() + DAY })
    const other = makeJwt({ exp: now() + 7 * DAY, uid: 2 })
    store.glassy_token = old
    fetch.mockImplementationOnce(async () => {
      store.glassy_token = other
      return { ok: true, status: 200, json: async () => ({ token: makeJwt({ exp: now() + 7 * DAY }) }) }
    })
    expect(await renewSessionIfDue()).toBe('changed')
    expect(store.glassy_token).toBe(other)
  })

  it('shares one request between overlapping callers', async () => {
    store.glassy_token = makeJwt({ exp: now() + DAY })
    respond(200, { token: makeJwt({ exp: now() + 7 * DAY }) })
    const [a, b] = await Promise.all([renewSessionIfDue(), renewSessionIfDue()])
    expect(a).toBe('renewed'); expect(b).toBe('renewed')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('renews below the threshold, not above it', () => {
    expect(RENEW_WHEN_SECONDS_LEFT).toBe(6 * DAY)
  })
})
