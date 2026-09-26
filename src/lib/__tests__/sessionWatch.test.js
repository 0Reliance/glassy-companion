import { beforeEach, describe, expect, it, vi } from 'vitest'

let listeners = []
beforeEach(() => {
  listeners = []
  vi.resetModules()
  vi.stubGlobal('chrome', {
    storage: {
      onChanged: {
        addListener: (fn) => listeners.push(fn),
        removeListener: (fn) => { listeners = listeners.filter(f => f !== fn) },
      },
    },
  })
})

const { watchSessionEnd } = await import('../sessionWatch.js')
const fire = (changes, area = 'local') => listeners.forEach(fn => fn(changes, area))

/**
 * The UI must never disagree with storage. apiFetch clears the stored token on an
 * interactive 401; without this the popup keeps rendering a logged-in shell whose every
 * action then fails. This covers EVERY interactive 401, not just the poller that first
 * exposed the problem.
 */
describe('watchSessionEnd', () => {
  it('fires when the stored token is removed', () => {
    const onEnd = vi.fn()
    watchSessionEnd(onEnd)
    fire({ glassy_token: { oldValue: 'jwt', newValue: undefined } })
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('does NOT fire when a token is written or replaced — only on removal', () => {
    // A login or a refresh writes a newValue. Bouncing the user to the login screen
    // there would log them out every time they log in.
    const onEnd = vi.fn()
    watchSessionEnd(onEnd)
    fire({ glassy_token: { newValue: 'jwt' } })
    fire({ glassy_token: { oldValue: 'a', newValue: 'b' } })
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('ignores other storage keys and other areas', () => {
    const onEnd = vi.fn()
    watchSessionEnd(onEnd)
    fire({ glassy_settings: { newValue: undefined } })
    fire({ glassy_collections_cache: { oldValue: 'x', newValue: undefined } })
    fire({ glassy_token: { newValue: undefined } }, 'session')
    fire({ glassy_token: { newValue: undefined } }, 'sync')
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('unsubscribes, so a closed popup leaves no listener behind', () => {
    const onEnd = vi.fn()
    const stop = watchSessionEnd(onEnd)
    expect(listeners).toHaveLength(1)
    stop()
    expect(listeners).toHaveLength(0)
    fire({ glassy_token: { newValue: undefined } })
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('a throwing listener cannot break the storage event', () => {
    watchSessionEnd(() => { throw new Error('consumer blew up') })
    expect(() => fire({ glassy_token: { newValue: undefined } })).not.toThrow()
  })

  it('never throws if chrome.storage is unavailable, and returns a no-op unsubscribe', () => {
    vi.stubGlobal('chrome', {})
    let stop
    expect(() => { stop = watchSessionEnd(vi.fn()) }).not.toThrow()
    expect(typeof stop).toBe('function')
    expect(() => stop()).not.toThrow()
  })
})
