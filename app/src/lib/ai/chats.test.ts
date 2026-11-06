import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveLater } from './chats'

describe('saveLater', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('saves once changes settle', () => {
    const save = vi.fn()
    const s = saveLater(save, 600, 2000)
    s.schedule()
    vi.advanceTimersByTime(300)
    s.schedule()
    vi.advanceTimersByTime(599)
    expect(save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('still saves every couple of seconds while an answer keeps streaming', () => {
    const save = vi.fn()
    const s = saveLater(save, 600, 2000)
    // A change every frame-ish for 5 s, the way a streaming answer updates the chat.
    for (let t = 0; t < 5000; t += 50) {
      s.schedule()
      vi.advanceTimersByTime(50)
    }
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('flushes a pending save right away, and only when one is pending', () => {
    const save = vi.fn()
    const s = saveLater(save, 600, 2000)
    s.flush()
    expect(save).not.toHaveBeenCalled()
    s.schedule()
    s.flush()
    expect(save).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000)
    expect(save).toHaveBeenCalledTimes(1)
  })
})
