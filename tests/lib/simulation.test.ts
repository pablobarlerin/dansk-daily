import { describe, it, expect } from 'vitest'
import type { Content, Lesson } from '../../src/content/types'
import type { Progress } from '../../src/lib/progressTypes'
import { emptyProgress } from '../../src/lib/store'
import { seeded } from '../../src/lib/rng'
import { addDays } from '../../src/lib/dates'
import { placementQuestions, applyPlacement } from '../../src/lib/placement'
import { loadContent } from '../../src/content/load'
import { BACKLOG_REVIEW_CAP, OVERLOAD } from '../../src/lib/queue'
import { content, ids, lesson, simulate, unit, type DayRecord } from './simHelpers'

const START = '2026-01-05'
const hasState = (p: Progress, id: string) => Object.hasOwn(p.states, id)

/** Units 1-4 are regular; unit 5 gets the given lessons. Places the learner:
 *  passes units 1-4, fails unit 5. */
function placed(c: Content): Progress {
  const p = emptyProgress(START)
  const questions = placementQuestions(c, p, seeded(7))
  const answers: Record<string, boolean> = {}
  for (const [u, qs] of Object.entries(questions)) for (const id of qs) answers[id] = u !== 'u5'
  const r = applyPlacement(c, p.states, questions, answers, START)
  p.states = r.states
  p.placement = { done: true, startUnitId: r.startUnitId }
  return p
}

const regularUnit = (n: number, lessons: number, size: number) =>
  unit(n, Array.from({ length: lessons }, (_, l) =>
    lesson(`u0${n}-l${String(l + 1).padStart(2, '0')}`, ids(`u${n}-l${l + 1}-`, size))))

function averageNew(rec: DayRecord[], from: number, to: number): number {
  const span = rec.slice(from - 1, to)
  return span.reduce((s, r) => s + r.newCount, 0) / span.length
}

describe('placement backlog (Review Focus 6)', () => {
  // unit 5: 15 lessons of 10 items, a recap after lesson 5, a repeat-only lesson after lesson 10
  const u5Lessons: Lesson[] = []
  for (let l = 1; l <= 15; l++) {
    u5Lessons.push(lesson(`u05-l${l}`, ids(`u5-l${l}-`, 10)))
    if (l === 5) u5Lessons.push(lesson('u05-recap', [], { recapOf: [1, 2, 3, 4, 5].flatMap(k => ids(`u5-l${k}-`, 10)) }))
    if (l === 10) u5Lessons.push(lesson('u05-repeat', [], { repeatLines: [{ da: 'hej', en: 'hi' }] }))
  }
  const c = content([1, 2, 3, 4].map(n => regularUnit(n, 15, 10)).concat(unit(5, u5Lessons)))
  const u5Ids = u5Lessons.flatMap(l => l.items.map(i => i.id))

  it('600 placed, then at least 3 new items every day while unit 5 has stateless items', () => {
    const p = placed(c)
    expect(Object.keys(p.states)).toHaveLength(600)
    expect(p.placement.startUnitId).toBe('u5')
    expect(u5Ids).toHaveLength(150)

    const rec: DayRecord[] = []
    const short: number[] = []
    const rng = seeded(1)
    for (let d = 0; d < 30; d++) {
      // fewer than 3 stateless items left is the end of the content, not a throttled day
      const remaining = u5Ids.filter(id => !hasState(p, id)).length
      const [r] = simulate(c, p, addDays(START, d + 1), 1, rng, 0)
      rec.push(r)
      if (remaining > 0 && !r.special && r.newCount < Math.min(3, remaining)) short.push(d)
    }
    // Known spec consequence (reported as a concern): the walk stops at a not-done recap /
    // repeat-only lesson, so with the overload limit of 3 the day that finishes the lesson
    // before it can get 1-2 items. Such a short day must be followed directly by that
    // special lesson's day; no other day may get fewer than 3.
    for (const d of short) {
      expect(rec[d].newCount, `day ${d + 1}`).toBeGreaterThan(0)
      expect(rec[d + 1]?.special, `day ${d + 2} should be a special-lesson day`).toBe(true)
    }
    expect(short.length).toBeLessThanOrEqual(2)
    console.log(`SIMULATION backlog: short days before a special lesson = ${short.map(d => `day ${d + 1}: ${rec[d].newCount}`).join(', ') || 'none'}`)
    // the backlog really did overload some days, and both special lessons were passed
    expect(rec.some(r => r.dueAtStart > OVERLOAD)).toBe(true)
    expect(p.lessonsDone['u05-recap']).toBe(true)
    expect(p.lessonsDone['u05-repeat']).toBe(true)
    expect(rec.filter(r => r.special)).toHaveLength(2)
    expect(u5Ids.filter(id => hasState(p, id)).length).toBeGreaterThanOrEqual(100)
  })

  it('small unit 5: passes the recap and repeat-only lessons and continues', () => {
    const small = content([1, 2, 3, 4].map(n => regularUnit(n, 2, 10)).concat(unit(5, [
      lesson('u05-l01', ids('a', 10)),
      lesson('u05-l02', [], { recapOf: ids('a', 10) }),
      lesson('u05-l03', [], { repeatLines: [{ da: 'hej', en: 'hi' }] }),
      lesson('u05-l04', ids('b', 10)),
    ])))
    const p = placed(small)
    expect(Object.keys(p.states)).toHaveLength(80)
    const rec = simulate(small, p, addDays(START, 1), 8, seeded(1), 0)
    expect(rec.map(r => r.queue.lessonId).slice(0, 4)).toEqual(['u05-l01', 'u05-l02', 'u05-l03', 'u05-l04'])
    expect(rec[1].queue.recapIds).toEqual(ids('a', 10).filter(id => !rec[1].queue.reviews.includes(id)))
    expect(rec[1].queue.recapIds.length + rec[1].queue.reviews.filter(id => id.startsWith('a')).length).toBe(10)
    expect(p.lessonsDone['u05-l02']).toBe(true)
    expect(p.lessonsDone['u05-l03']).toBe(true)
    expect([...ids('a', 10), ...ids('b', 10)].every(id => hasState(p, id))).toBe(true)
    expect(rec[rec.length - 1].queue.lessonId).toBeNull()
  })
})

describe('long runs: 900 items in 90 lessons of 10', () => {
  const c = content(Array.from({ length: 9 }, (_, u) => regularUnit(u + 1, 10, 10)))
  const allIds = c.units.flatMap(u => u.lessons.flatMap(l => l.items.map(i => i.id)))

  it('all correct: average ≥ 8 new per day over days 31-90, dueAtStart never > 60', () => {
    expect(allIds).toHaveLength(900)
    const p = emptyProgress(START)
    expect(p.settings.newPerDay).toBe(10)
    const rec = simulate(c, p, START, 180, seeded(1), 0)
    expect(averageNew(rec, 31, 90)).toBeGreaterThanOrEqual(8)
    expect(Math.max(...rec.map(r => r.dueAtStart))).toBeLessThanOrEqual(OVERLOAD)
    expect(allIds.every(id => hasState(p, id))).toBe(true)
  })

  it('realistic (12% wrong): at least 3 new every day while stateless items remain', () => {
    const p = emptyProgress(START)
    const rng = seeded(2026)
    const rec: DayRecord[] = []
    for (let d = 0; d < 180; d++) {
      // fewer than 3 stateless items left is the end of the content, not a throttled day
      const remaining = allIds.filter(id => !hasState(p, id)).length
      const [r] = simulate(c, p, addDays(START, d), 1, rng, 0.12)
      rec.push(r)
      if (remaining > 0) expect(r.newCount, `day ${d + 1}`).toBeGreaterThanOrEqual(Math.min(3, remaining))
    }
    const avg = averageNew(rec, 31, 90)
    const overloaded = rec.filter(r => r.dueAtStart > OVERLOAD).length
    console.log(`SIMULATION realistic: average new items per day (days 31-90) = ${avg.toFixed(2)}`)
    console.log(`SIMULATION realistic: days with dueAtStart > 60 (of 180) = ${overloaded}`)
    expect(allIds.every(id => hasState(p, id))).toBe(true)
  })
})

describe('real content: placement at unit 6, 90 days, always correct (2026-11-25 backlog cap)', () => {
  const c = loadContent()
  /** Units 1-5 pass, every later unit fails, as the e2e learner does. */
  function placedAtUnit6(): Progress {
    const p = emptyProgress(START)
    const questions = placementQuestions(c, p, seeded(7))
    const order = new Map(c.units.map(u => [u.id, u.order]))
    const answers: Record<string, boolean> = {}
    for (const [u, qs] of Object.entries(questions)) for (const id of qs) answers[id] = order.get(u)! <= 5
    const r = applyPlacement(c, p.states, questions, answers, START)
    p.states = r.states
    p.placement = { done: true, startUnitId: r.startUnitId }
    return p
  }

  it('never more than 100 reviews a day, and the backlog clears by day 60', () => {
    const p = placedAtUnit6()
    const rec = simulate(c, p, addDays(START, 1), 90, seeded(1), 0)
    const reviews = (r: DayRecord) => r.queue.reviews.length
    expect(Math.max(...rec.map(reviews))).toBeLessThanOrEqual(BACKLOG_REVIEW_CAP)
    expect(rec.slice(59).every(r => r.dueAtStart <= OVERLOAD)).toBe(true)
  })
})
