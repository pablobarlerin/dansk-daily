import type { Verdict } from './answers'
import { addDays } from './dates'

export interface ItemState {
  strength: number
  due: string
  lapses: number
  seen: number
  known: boolean
  /** Set by applyPlacement; any review clears it ("placement-pending" until then). Optional, so schema 1 is unchanged. */
  placed?: true
}
export type Level = 'recognise' | 'assemble' | 'produce'

export const INTERVALS: Record<number, number> = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30, 6: 60, 7: 120 }
export const MAX_STRENGTH = 7

export function newState(today: string): ItemState {
  return { strength: 0, due: today, lapses: 0, seen: 0, known: false }
}

export function review(prev: ItemState, v: Verdict, today: string): ItemState {
  const { placed: _placed, ...s } = prev
  const seen = s.seen + 1
  const known = s.known || v !== 'wrong'
  if (v === 'wrong') {
    return { strength: s.strength > 1 ? 1 : 0, due: addDays(today, 1), lapses: s.lapses + 1, seen, known }
  }
  if (v === 'almost' && s.strength === 3) {
    return { ...s, strength: 3, due: addDays(today, INTERVALS[3]), seen, known }
  }
  const strength = Math.min(MAX_STRENGTH, s.strength + 1)
  return { ...s, strength, due: addDays(today, INTERVALS[strength]), seen, known }
}

export function levelFor(strength: number): Level {
  if (strength <= 1) return 'recognise'
  if (strength === 2) return 'assemble'
  return 'produce'
}

export function isDue(s: ItemState, today: string): boolean {
  return s.due <= today
}

export function setStrength(s: ItemState | undefined, strength: number, today: string): ItemState {
  if (!Number.isInteger(strength) || strength < 0 || strength > MAX_STRENGTH) {
    throw new Error(`Invalid strength: ${strength}`)
  }
  const base = s ?? newState(today)
  return {
    strength,
    due: strength === 0 ? today : addDays(today, INTERVALS[strength]),
    lapses: base.lapses,
    seen: base.seen,
    known: strength >= 1,
  }
}
