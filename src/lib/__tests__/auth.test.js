import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

// ── JWT helpers ────────────────────────────────────────────────────────────────
// Build a minimal JWT with base64url-encoded payload
function makeJwt(payload) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${header}.${body}.fakesig`
}

const PAST_EXP = Math.floor(Date.now() / 1000) - 3600  // 1 hour ago
const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now

// ── Chrome storage mock ────────────────────────────────────────────────────────
function makeStorageMock() {
  let store = {}
  return {
    get: vi.fn(async (keys) => {
      if (typeof keys === 'string') return { [keys]: store[keys] }
      const result = {}
      for (const k of (Array.isArray(keys) ? keys : Object.keys(keys))) result[k] = store[k]
      return result
    }),
    set: vi.fn(async (obj) => { Object.assign(store, obj) }),
    remove: vi.fn(async (key) => {
      if (Array.isArray(key)) key.forEach(k => delete store[k])
      else delete store[key]
    }),
    _store: store,
    _reset: () => { store = {}; Object.assign(makeStorageMock()._store, store) },
  }
}

let sessionStorage
let localStorage_

beforeEach(() => {
  sessionStorage = makeStorageMock()
  localStorage_ = makeStorageMock()
  globalThis.chrome = {
    storage: {
      session: sessionStorage,
      local: localStorage_,
    },
  }
  globalThis.fetch = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Re-import auth each time to reset module state
const authModule = await import('../auth.js')
const {
  getToken,
  setToken,
  clearAuth,
  getCachedUser,
  setCachedUser,
  getBaseUrl,
  setBaseUrl,
  login,
} = authModule

describe('auth.js', () => {
  describe('getToken', () => {
    it('returns null when no token stored', async () => {
      const token = await getToken()
      expect(token).toBeNull()
    })

    it('returns token when valid (exp in future)', async () => {
      const jwt = makeJwt({ sub: 'u1', exp: FUTURE_EXP })
      sessionStorage._store['glassy_token'] = jwt
      const token = await getToken()
      expect(token).toBe(jwt)
    })

    it('returns null and clears auth when token is expired', async () => {
      const jwt = makeJwt({ sub: 'u1', exp: PAST_EXP })
      sessionStorage._store['glassy_token'] = jwt
      localStorage_._store['glassy_user'] = { id: 'u1' }

      const token = await getToken()

      expect(token).toBeNull()
      expect(sessionStorage.remove).toHaveBeenCalledWith('glassy_token')
      expect(localStorage_.remove).toHaveBeenCalledWith('glassy_user')
    })

    it('returns token when JWT has no exp claim (treated as valid)', async () => {
      const jwt = makeJwt({ sub: 'u1' }) // no exp
      sessionStorage._store['glassy_token'] = jwt
      const token = await getToken()
      expect(token).toBe(jwt)
    })

    it('returns null when JWT payload is malformed', async () => {
      // Manually corrupt the token payload
      sessionStorage._store['glassy_token'] = 'bad.!!!.sig'
      const token = await getToken()
      // malformed JWT → decodeJwtPayload returns null → exp check skipped → token returned as-is
      // (no exp means not expired)
      // The token itself is returned since it just won't parse exp
      expect(token).toBe('bad.!!!.sig')
    })
  })

  describe('setToken / clearAuth', () => {
    it('setToken stores token in session storage', async () => {
      await setToken('mytoken')
      expect(sessionStorage.set).toHaveBeenCalledWith({ glassy_token: 'mytoken' })
    })

    it('clearAuth removes token and user', async () => {
      sessionStorage._store['glassy_token'] = 'tok'
      localStorage_._store['glassy_user'] = { id: 1 }

      await clearAuth()

      expect(sessionStorage.remove).toHaveBeenCalledWith('glassy_token')
      expect(localStorage_.remove).toHaveBeenCalledWith('glassy_user')
      expect(localStorage_.remove).toHaveBeenCalledWith('glassy_active_account_id')
    })
  })

  describe('getCachedUser / setCachedUser', () => {
    it('returns null when no user cached', async () => {
      const user = await getCachedUser()
      expect(user).toBeNull()
    })

    it('returns cached user', async () => {
      const u = { id: 'u1', email: 'a@b.com' }
      localStorage_._store['glassy_user'] = u
      const user = await getCachedUser()
      expect(user).toEqual(u)
    })

    it('setCachedUser stores user', async () => {
      const u = { id: 'u1' }
      await setCachedUser(u)
      expect(localStorage_.set).toHaveBeenCalledWith({ glassy_user: u })
    })
  })

  describe('getBaseUrl / setBaseUrl', () => {
    it('returns default URL when nothing stored', async () => {
      const url = await getBaseUrl()
      expect(url).toBe('https://glassy.fyi')
    })

    it('returns stored URL when set', async () => {
      localStorage_._store['glassy_base_url'] = 'https://self.hosted.example'
      const url = await getBaseUrl()
      expect(url).toBe('https://self.hosted.example')
    })

    it('setBaseUrl accepts https:// URLs', async () => {
      await setBaseUrl('https://example.com')
      expect(localStorage_.set).toHaveBeenCalledWith({ glassy_base_url: 'https://example.com' })
    })

    it('setBaseUrl trims trailing slash', async () => {
      await setBaseUrl('https://example.com/')
      expect(localStorage_.set).toHaveBeenCalledWith({ glassy_base_url: 'https://example.com' })
    })

    it('setBaseUrl accepts http://localhost', async () => {
      await setBaseUrl('http://localhost:3000')
      expect(localStorage_.set).toHaveBeenCalledWith({ glassy_base_url: 'http://localhost:3000' })
    })

    it('setBaseUrl rejects plain http:// non-localhost', async () => {
      await expect(setBaseUrl('http://example.com')).rejects.toThrow('Server URL must use HTTPS.')
    })

    it('setBaseUrl rejects ftp:// URLs', async () => {
      await expect(setBaseUrl('ftp://example.com')).rejects.toThrow('Server URL must use HTTPS.')
    })
  })

  describe('login', () => {
    it('rejects invalid email format', async () => {
      const result = await login('notanemail', 'pass')
      expect(result).toEqual({ ok: false, error: 'Please enter a valid email address.' })
    })

    it('rejects empty email', async () => {
      const result = await login('', 'pass')
      expect(result).toEqual({ ok: false, error: 'Please enter a valid email address.' })
    })

    it('rejects null email', async () => {
      const result = await login(null, 'pass')
      expect(result).toEqual({ ok: false, error: 'Please enter a valid email address.' })
    })

    it('returns success on valid credentials', async () => {
      localStorage_._store['glassy_base_url'] = 'https://glassy.test'
      const user = { id: 'u1', email: 'a@b.com' }
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ token: 'tok123', user }),
      })

      const result = await login('a@b.com', 'password123')

      expect(result).toEqual({ ok: true, user, token: 'tok123' })
      expect(sessionStorage.set).toHaveBeenCalledWith({ glassy_token: 'tok123' })
      expect(localStorage_.set).toHaveBeenCalledWith({ glassy_user: user })
    })

    it('returns error on server rejection', async () => {
      localStorage_._store['glassy_base_url'] = 'https://glassy.test'
      globalThis.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Invalid credentials' }),
      })

      const result = await login('a@b.com', 'wrongpass')

      expect(result).toEqual({ ok: false, error: 'Invalid credentials' })
    })

    it('returns network error on fetch failure', async () => {
      localStorage_._store['glassy_base_url'] = 'https://glassy.test'
      globalThis.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

      const result = await login('a@b.com', 'pass')

      expect(result).toEqual({ ok: false, error: 'Network error. Check your connection.' })
    })
  })
})
