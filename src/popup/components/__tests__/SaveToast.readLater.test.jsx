// @vitest-environment jsdom
/**
 * "Remind me to read it" after a save: one tap adds an event to the person's own Glassy
 * calendar through POST /api/ext/calendar/events (the route the server has carried for
 * the extension since Sep 2026). With calendar sync on, it shows on every Glassy they pair.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

const createCalendarEvent = vi.fn()
vi.mock('../../../lib/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, createCalendarEvent: (...a) => createCalendarEvent(...a) }
})
vi.mock('../../hooks/useExtensionBridge.js', () => ({ deleteCapture: vi.fn() }))

const { default: SaveToast } = await import('../SaveToast.jsx')
const { reminderTimes, ApiError } = await import('../../../lib/api.js')

describe('reminderTimes', () => {
  it('lands tomorrow at 9:00 local time, for half an hour', () => {
    const now = new Date(2026, 10, 10, 15, 30) // Nov 10, 15:30 local
    const { startAt, endAt } = reminderTimes('tomorrow', now)
    const s = new Date(startAt)
    expect([s.getFullYear(), s.getMonth(), s.getDate(), s.getHours(), s.getMinutes()]).toEqual([2026, 10, 11, 9, 0])
    expect(new Date(endAt) - s).toBe(30 * 60 * 1000)
  })
  it('lands the same day next week at 9:00, across a month end', () => {
    const s = new Date(reminderTimes('week', new Date(2026, 10, 28, 8, 0)).startAt)
    expect([s.getMonth(), s.getDate(), s.getHours()]).toEqual([11, 5, 9])
  })
})

describe('the save card', () => {
  let container, root
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  const render = async (props = {}) => {
    await act(async () => {
      root.render(createElement(SaveToast, { type: 'saved', onDismiss: vi.fn(), pageTitle: 'Boiler guide', pageUrl: 'https://example.test/boiler', ...props }))
    })
  }
  const click = async (label) => {
    const btn = [...container.querySelectorAll('button')].find(b => b.textContent === label)
    expect(btn, `${label} button did not render`).toBeTruthy()
    await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await act(async () => { await Promise.resolve() })
  }

  it('offers a reminder only after a save', async () => {
    await render({ type: 'error', errorMessage: 'x' })
    expect(container.querySelector('[data-testid="read-later"]')).toBeNull()
    await render()
    expect(container.querySelector('[data-testid="read-later"]')).not.toBeNull()
  })

  it('adds the page to the calendar and says when', async () => {
    createCalendarEvent.mockResolvedValue({ event: { id: 'e1' } })
    await render()
    await click('Tomorrow')
    expect(createCalendarEvent).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Read: Boiler guide',
      description: 'https://example.test/boiler',
      startAt: expect.any(String),
      endAt: expect.any(String),
    }))
    expect(container.textContent).toContain('Added to your Glassy calendar for tomorrow at 9:00.')
  })

  it('keeps the card open while the reminder confirms, instead of closing after 8 seconds', async () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    createCalendarEvent.mockResolvedValue({ event: { id: 'e1' } })
    await render({ onDismiss })
    await click('Next week')
    await act(async () => { vi.advanceTimersByTime(9000) })
    expect(onDismiss).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('says plainly when an older Glassy has no reminders', async () => {
    createCalendarEvent.mockRejectedValue(new ApiError(404, 'Not found', null))
    await render()
    await click('Tomorrow')
    expect(container.textContent).toContain('too old for reminders from the extension')
  })
})
