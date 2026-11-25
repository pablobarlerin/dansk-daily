import { describe, expect, it } from 'vitest'
import { INTERVALS, isDue, levelFor, newState, review, setStrength, type ItemState } from '../../src/lib/srs'
import { addDays } from '../../src/lib/dates'

const T = '2026-06-10'
const at = (strength: number, extra: Partial<ItemState> = {}): ItemState => ({
  strength, due: T, lapses: 0, seen: 0, known: strength > 0, ...extra,
})

describe('newState', () => {
  it('starts at zero, due today', () => {
    expect(newState(T)).toEqual({ strength: 0, due: T, lapses: 0, seen: 0, known: false })
  })
})

describe('review correct', () => {
  const steps: [number, number, number][] = [[0, 1, 1], [1, 2, 3], [2, 3, 7], [3, 4, 14], [4, 5, 30], [5, 6, 60], [6, 7, 120], [7, 7, 120]]
  for (const [from, to, days] of steps) {
    it(`${from} -> ${to}, due +${days}`, () => {
      const r = review(at(from), 'correct', T)
      expect(r.strength).toBe(to)
      expect(r.due).toBe(addDays(T, days))
      expect(r.known).toBe(true)
      expect(r.seen).toBe(1)
      expect(r.lapses).toBe(0)
    })
  }
  it('does not mutate input', () => {
    const s = at(2)
    review(s, 'correct', T)
    expect(s).toEqual(at(2))
  })
})

describe('review almost', () => {
  for (const from of [0, 1, 2, 4, 5, 6, 7]) {
    it(`from ${from} equals correct`, () => {
      expect(review(at(from), 'almost', T)).toEqual(review(at(from), 'correct', T))
    })
  }
  it('at 3 stays 3, due +7', () => {
    const r = review(at(3), 'almost', T)
    expect(r.strength).toBe(3)
    expect(r.due).toBe(addDays(T, 7))
    expect(r.seen).toBe(1)
    expect(r.known).toBe(true)
  })
})

describe('review wrong', () => {
  it('from 4 -> 1, due tomorrow, lapse', () => {
    const r = review(at(4), 'wrong', T)
    expect(r).toMatchObject({ strength: 1, due: addDays(T, 1), lapses: 1, seen: 1, known: true })
  })
  it('from 7 -> 1', () => expect(review(at(7), 'wrong', T).strength).toBe(1))
  it('from 1 -> 0', () => expect(review(at(1), 'wrong', T).strength).toBe(0))
  it('from 0 -> 0, known stays false', () => {
    const r = review(newState(T), 'wrong', T)
    expect(r).toMatchObject({ strength: 0, known: false, lapses: 1, seen: 1, due: addDays(T, 1) })
  })
})

describe('levelFor / isDue / INTERVALS', () => {
  it('levels', () => {
    expect([0, 1].map(levelFor)).toEqual(['recognise', 'recognise'])
    expect(levelFor(2)).toBe('assemble')
    expect([3, 4, 5, 6, 7].map(levelFor)).toEqual(Array(5).fill('produce'))
  })
  it('isDue', () => {
    expect(isDue(at(1, { due: T }), T)).toBe(true)
    expect(isDue(at(1, { due: '2026-06-09' }), T)).toBe(true)
    expect(isDue(at(1, { due: '2026-06-11' }), T)).toBe(false)
  })
  it('intervals', () => expect(INTERVALS[7]).toBe(120))
})

describe('setStrength', () => {
  it('new state at 3', () => {
    expect(setStrength(undefined, 3, T)).toEqual({ strength: 3, due: addDays(T, 7), lapses: 0, seen: 0, known: true })
  })
  it('0 -> due today, not known', () => {
    expect(setStrength(at(4), 0, T)).toMatchObject({ strength: 0, due: T, known: false })
  })
  it('keeps lapses and seen', () => {
    expect(setStrength(at(2, { lapses: 3, seen: 9 }), 5, T)).toMatchObject({ lapses: 3, seen: 9, due: addDays(T, 30) })
  })
  it('throws on invalid', () => {
    expect(() => setStrength(undefined, 8, T)).toThrow()
    expect(() => setStrength(undefined, -1, T)).toThrow()
    expect(() => setStrength(undefined, 1.5, T)).toThrow()
  })
})

describe('placed (placement-pending) is cleared by any review', () => {
  for (const v of ['correct', 'almost', 'wrong'] as const) {
    it(v, () => {
      expect(review(at(3, { placed: true }), v, T).placed).toBeUndefined()
      expect(review(at(2, { placed: true }), v, T).placed).toBeUndefined()
    })
  }
  it('setStrength never sets it', () => expect(setStrength(undefined, 3, T).placed).toBeUndefined())
})
