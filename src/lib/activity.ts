import { addDays, localDay } from './dates'
import type { DayLog } from './progressTypes'

export const GOAL_SECONDS = 900
export const IDLE_SECONDS = 60

export interface TimerState {
  lastActivity: number | null
  visible: boolean
}
export type ActivityEvent = { type: 'activity' | 'hidden' | 'visible'; at: number }
export interface Credit {
  day: string
  seconds: number
}

function nextLocalMidnight(ms: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
}

// Credit the span [from, to] to local days, split at local midnight.
function creditSpan(from: number, to: number): Credit[] {
  const out: Credit[] = []
  let cur = from
  while (cur < to) {
    const end = Math.min(to, nextLocalMidnight(cur))
    const day = localDay(new Date(cur))
    const seconds = (end - cur) / 1000
    const last = out[out.length - 1]
    if (last && last.day === day) last.seconds += seconds
    else out.push({ day, seconds })
    cur = end
  }
  return out
}

function gapCredit(t: TimerState, at: number): Credit[] {
  if (!t.visible || t.lastActivity === null) return []
  const gap = (at - t.lastActivity) / 1000
  if (gap <= 0 || gap > IDLE_SECONDS) return []
  return creditSpan(t.lastActivity, at)
}

export function onEvent(t: TimerState, ev: ActivityEvent): { t: TimerState; credit: Credit[] } {
  if (ev.type === 'activity') {
    if (!t.visible) return { t, credit: [] }
    return { t: { lastActivity: ev.at, visible: true }, credit: gapCredit(t, ev.at) }
  }
  if (ev.type === 'hidden') {
    return { t: { lastActivity: null, visible: false }, credit: gapCredit(t, ev.at) }
  }
  return { t: { lastActivity: null, visible: true }, credit: [] }
}

export function streak(days: Record<string, DayLog>, today: string): number {
  const met = (d: string) => (days[d]?.activeSeconds ?? 0) >= GOAL_SECONDS
  let day = met(today) ? today : addDays(today, -1)
  let n = 0
  while (met(day)) {
    n++
    day = addDays(day, -1)
  }
  return n
}
