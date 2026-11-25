import { describe, it, expect } from 'vitest'
import { onEvent, streak, GOAL_SECONDS, type TimerState } from '../../src/lib/activity'
import { localDay, addDays } from '../../src/lib/dates'
import type { DayLog } from '../../src/lib/progressTypes'

const at = (y: number, m: number, d: number, h = 0, min = 0, s = 0) =>
  new Date(y, m - 1, d, h, min, s).getTime()
const start: TimerState = { lastActivity: null, visible: true }

describe('onEvent', () => {
  it('credits 30 s between activities 30 s apart', () => {
    const a = onEvent(start, { type: 'activity', at: at(2026, 5, 10, 12) })
    expect(a.credit).toEqual([])
    const b = onEvent(a.t, { type: 'activity', at: at(2026, 5, 10, 12, 0, 30) })
    expect(b.credit).toEqual([{ day: '2026-05-10', seconds: 30 }])
  })
  it('credits 0 when 5 minutes apart', () => {
    const a = onEvent(start, { type: 'activity', at: at(2026, 5, 10, 12) })
    const b = onEvent(a.t, { type: 'activity', at: at(2026, 5, 10, 12, 5) })
    expect(b.credit).toEqual([])
    expect(b.t.lastActivity).toBe(at(2026, 5, 10, 12, 5))
  })
  it('hidden then visible 10 min later credits nothing for the hidden span', () => {
    const a = onEvent(start, { type: 'activity', at: at(2026, 5, 10, 12) })
    const h = onEvent(a.t, { type: 'hidden', at: at(2026, 5, 10, 12, 0, 20) })
    expect(h.credit).toEqual([{ day: '2026-05-10', seconds: 20 }])
    expect(h.t.visible).toBe(false)
    const v = onEvent(h.t, { type: 'visible', at: at(2026, 5, 10, 12, 10, 20) })
    expect(v.credit).toEqual([])
    expect(v.t.visible).toBe(true)
    const n = onEvent(v.t, { type: 'activity', at: at(2026, 5, 10, 12, 10, 30) })
    expect(n.credit).toEqual([])
  })
  it('hidden after a long idle credits nothing', () => {
    const a = onEvent(start, { type: 'activity', at: at(2026, 5, 10, 12) })
    const h = onEvent(a.t, { type: 'hidden', at: at(2026, 5, 10, 12, 5) })
    expect(h.credit).toEqual([])
  })
  it('splits at local midnight', () => {
    const a = onEvent(start, { type: 'activity', at: at(2026, 5, 10, 23, 59, 40) })
    const b = onEvent(a.t, { type: 'activity', at: at(2026, 5, 11, 0, 0, 10) })
    expect(b.credit).toEqual([
      { day: '2026-05-10', seconds: 20 },
      { day: '2026-05-11', seconds: 10 },
    ])
  })
})

describe('streak', () => {
  const today = '2026-05-10'
  const met = (n: number): DayLog => ({ activeSeconds: n, newIntroduced: 0, reviewsDone: 0 })
  const days = (offsets: number[], secs = GOAL_SECONDS) =>
    Object.fromEntries(offsets.map((o) => [addDays(today, o), met(secs)]))
  it('3 previous days met, today not yet -> 3', () => {
    expect(streak(days([-1, -2, -3]), today)).toBe(3)
    expect(streak({ ...days([-1, -2, -3]), [today]: met(100) }, today)).toBe(3)
  })
  it('today too -> 4', () => {
    expect(streak(days([0, -1, -2, -3]), today)).toBe(4)
  })
  it('gap day counts only after the gap', () => {
    expect(streak(days([0, -1, -3, -4]), today)).toBe(2)
  })
  it('below goal does not count; empty -> 0', () => {
    expect(streak(days([-1], GOAL_SECONDS - 1), today)).toBe(0)
    expect(streak({}, today)).toBe(0)
  })
  it('session crossing midnight does not break the streak', () => {
    const a = onEvent(start, { type: 'activity', at: at(2026, 5, 9, 23, 55) })
    expect(localDay(new Date(a.t.lastActivity!))).toBe('2026-05-09')
    expect(streak({ ...days([-1, -2]), [today]: met(30) }, today)).toBe(2)
  })
})
