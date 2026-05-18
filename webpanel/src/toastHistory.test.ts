import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  pushToHistory,
  getHistory,
  getUnreadCount,
  markAllRead,
  clearHistory,
  setPanelOpen,
  subscribeHistory,
} from './toastHistory'

beforeEach(() => {
  clearHistory()
  setPanelOpen(false)
})

describe('toastHistory', () => {
  it('starts empty', () => {
    expect(getHistory()).toHaveLength(0)
    expect(getUnreadCount()).toBe(0)
  })

  it('records pushes in newest-first order', () => {
    pushToHistory('info', 'first')
    pushToHistory('error', 'second')
    pushToHistory('success', 'third')
    const history = getHistory()
    expect(history).toHaveLength(3)
    expect(history[0].message).toBe('third')
    expect(history[2].message).toBe('first')
  })

  it('counts unread until markAllRead is called', () => {
    pushToHistory('info', 'a')
    pushToHistory('warning', 'b')
    expect(getUnreadCount()).toBe(2)

    markAllRead()
    expect(getUnreadCount()).toBe(0)

    pushToHistory('info', 'c')
    expect(getUnreadCount()).toBe(1)
  })

  it('marks new pushes as read while panel is open', () => {
    setPanelOpen(true)
    pushToHistory('info', 'live')
    expect(getUnreadCount()).toBe(0)
  })

  it('clearHistory empties the buffer', () => {
    pushToHistory('info', 'x')
    pushToHistory('info', 'y')
    expect(getHistory()).toHaveLength(2)
    clearHistory()
    expect(getHistory()).toHaveLength(0)
  })

  it('caps the buffer at 50 entries (oldest dropped)', () => {
    for (let i = 0; i < 60; i++) pushToHistory('info', `m${i}`)
    const h = getHistory()
    expect(h).toHaveLength(50)
    // newest-first ordering: last push is at index 0
    expect(h[0].message).toBe('m59')
    // anything before m10 should be dropped
    expect(h.find(e => e.message === 'm9')).toBeUndefined()
  })

  it('notifies subscribers on every change', () => {
    const cb = vi.fn()
    const unsub = subscribeHistory(cb)
    pushToHistory('info', 'a')
    pushToHistory('info', 'b')
    expect(cb).toHaveBeenCalledTimes(2)
    unsub()
    pushToHistory('info', 'c')
    expect(cb).toHaveBeenCalledTimes(2) // no further calls after unsub
  })
})
