import { beforeEach, describe, expect, it, vi } from 'vitest'

const { startPolling } = await import('../notificationPoller.js')

describe('notificationPoller — poll ONLY while the capability is available', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  it('polls on the interval and reports the unread count', async () => {
    const fetcher = vi.fn(async () => ({ notifications: [], unreadCount: 3 }))
    const onUpdate = vi.fn()
    const stop = startPolling({ fetcher, intervalMs: 60_000, onUpdate })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith({ notifications: [], unreadCount: 3 })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetcher).toHaveBeenCalledTimes(2)
    stop()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetcher).toHaveBeenCalledTimes(2) // stopped — no more polls
  })

  it('never polls when the capability is unavailable (cloud)', async () => {
    const fetcher = vi.fn(async () => ({ notifications: [], unreadCount: 1 }))
    const stop = startPolling({ fetcher, intervalMs: 60_000, onUpdate: vi.fn(), isAvailable: false })
    await vi.advanceTimersByTimeAsync(180_000)
    expect(fetcher).not.toHaveBeenCalled()
    stop()
  })

  it('a failing poll reports zero and keeps polling (the badge never dies)', async () => {
    const fetcher = vi.fn(async () => { throw new Error('ECONNREFUSED') })
    const onUpdate = vi.fn()
    const stop = startPolling({ fetcher, intervalMs: 60_000, onUpdate })
    await vi.advanceTimersByTimeAsync(0)
    expect(onUpdate).toHaveBeenCalledWith({ notifications: [], unreadCount: 0 })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetcher).toHaveBeenCalledTimes(2)
    stop()
  })

  it('respects isAvailable re-checks between ticks: capability lost → polling stops', async () => {
    const fetcher = vi.fn(async () => ({ notifications: [], unreadCount: 1 }))
    let available = true
    const stop = startPolling({ fetcher, intervalMs: 60_000, onUpdate: vi.fn(), isAvailable: () => available })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetcher).toHaveBeenCalledTimes(1)
    available = false
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetcher).toHaveBeenCalledTimes(1) // no further polls after the gate closed
    stop()
  })
})