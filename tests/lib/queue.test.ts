import { describe, it, expect } from 'vitest'
import type { Content, Item, Lesson, Unit } from '../../src/content/types'
import type { DayLog, Progress } from '../../src/lib/progressTypes'
import type { ItemState } from '../../src/lib/srs'
import { nextLesson } from '../../src/lib/path'
import { REVIEW_CAP, OVERLOAD, MIN_NEW, BACKLOG_REVIEW_CAP, buildDailyQueue } from '../../src/lib/queue'

const TODAY = '2026-03-01'
const item = (id: string): Item => ({ id, kind: 'word', da: id, en: id })
const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i}`)
const lesson = (id: string, itemIds: string[], extra: Partial<Lesson> = {}): Lesson => ({
  id, title: id, pages: [1], taughtInClass: true, items: itemIds.map(item), ...extra,
})
const unit = (n: number, lessons: Lesson[]): Unit => ({
  id: `u${n}`, order: n, title: `U${n}`, subtitle: '', pages: [1], lessons,
})
const content = (units: Unit[]): Content => ({ version: 'v', units, hashes: {} })
const st = (extra: Partial<ItemState> = {}): ItemState => ({
  strength: 1, due: TODAY, lapses: 0, seen: 1, known: true, ...extra,
})
const prog = (extra: Partial<Progress> = {}): Progress => ({
  schemaVersion: 1, firstUse: '2026-01-01', states: {}, lessonsDone: {}, repeatsSeen: {},
  placement: { done: true, startUnitId: null }, days: {}, reports: [],
  settings: { audio: true, speed: 1, newPerDay: 10, backupNudge: true },
  lastBackupNudge: null, contentVersion: null, ...extra,
})
const day = (extra: Partial<DayLog> = {}): Record<string, DayLog> => ({
  [TODAY]: { activeSeconds: 0, newIntroduced: 0, reviewsDone: 0, ...extra },
})
const report = (id: string) => ({ itemId: id, unitId: 'u1', da: '', en: '', note: '', day: TODAY, itemHash: '' })
const dueStates = (idList: string[], extra: Partial<ItemState> = {}) =>
  Object.fromEntries(idList.map(id => [id, st(extra)]))

// u1-l1: 80 review candidates, u1-l2 / u1-l3: 20 + 20 fresh items
const big = content([unit(1, [
  lesson('u01-l01', ids('r', 80)),
  lesson('u01-l02', ids('n', 20)),
  lesson('u01-l03', ids('m', 20)),
])])
// r0..r(n-1) due today, the rest of r* known and due later
const withDue = (n: number, extra: Partial<Progress> = {}) => prog({
  states: {
    ...dueStates(ids('r', 80), { due: '2026-04-01' }),
    ...dueStates(ids('r', n)),
  },
  ...extra,
})

describe('constants', () => {
  it('values', () => expect([REVIEW_CAP, OVERLOAD, MIN_NEW]).toEqual([60, 60, 3]))
})

describe('caps and overload', () => {
  it('70 due → 70 reviews (backlog cap 100) and 3 new', () => {
    const q = buildDailyQueue(big, withDue(70), TODAY, {})
    expect(q.dueTotal).toBe(70)
    expect(q.reviews).toHaveLength(70)
    expect(q.newItems).toEqual(['n0', 'n1', 'n2'])
    expect(q.lessonId).toBe('u01-l02')
  })
  it('61 due → 3 new', () => {
    expect(buildDailyQueue(big, withDue(61), TODAY, {}).newItems).toHaveLength(3)
  })
  it('60 due → 10 new', () => {
    const q = buildDailyQueue(big, withDue(60), TODAY, {})
    expect(q.reviews).toHaveLength(60)
    expect(q.newItems).toEqual(ids('n', 10))
  })
  it('new items fill across lessons up to the limit', () => {
    const q = buildDailyQueue(big, withDue(0, { settings: { ...prog().settings, newPerDay: 25 } }), TODAY, {})
    expect(q.newItems).toEqual([...ids('n', 20), ...ids('m', 5)])
    expect(q.lessonId).toBe('u01-l02')
  })
  it('reviewsDone = 50 with 70 due → 50 reviews (cap 100)', () => {
    const q = buildDailyQueue(big, withDue(70, { days: day({ reviewsDone: 50 }) }), TODAY, {})
    expect(q.reviews).toHaveLength(50)
    expect(q.dueTotal).toBe(70)
  })
  it('reviewsDone above the cap → 0 reviews', () => {
    expect(buildDailyQueue(big, withDue(70, { days: day({ reviewsDone: 105 }) }), TODAY, {}).reviews).toEqual([])
  })
  it('dueAtStart = 65 with only 5 still due → at most 3 new', () => {
    const q = buildDailyQueue(big, withDue(5, { days: day({ dueAtStart: 65 }) }), TODAY, {})
    expect(q.dueTotal).toBe(5)
    expect(q.newItems).toHaveLength(3)
  })
  it('dueAtStart = 65 and newIntroduced = 3 → none', () => {
    const q = buildDailyQueue(big, withDue(5, { days: day({ dueAtStart: 65, newIntroduced: 3 }) }), TODAY, {})
    expect(q.newItems).toEqual([])
  })
  it('dueAtStart = 40 with 70 now due → not overloaded (stored value wins)', () => {
    expect(buildDailyQueue(big, withDue(70, { days: day({ dueAtStart: 40 }) }), TODAY, {}).newItems).toHaveLength(10)
  })
  it('newIntroduced = 10 → no new', () => {
    expect(buildDailyQueue(big, withDue(0, { days: day({ newIntroduced: 10 }) }), TODAY, {}).newItems).toEqual([])
  })
  it('newIntroduced = 4 → 6 new', () => {
    expect(buildDailyQueue(big, withDue(0, { days: day({ newIntroduced: 4 }) }), TODAY, {}).newItems).toEqual(ids('n', 6))
  })
  it('does not write dueAtStart', () => {
    const p = withDue(70)
    buildDailyQueue(big, p, TODAY, {})
    expect(p.days).toEqual({})
  })
})

describe('review selection', () => {
  const c = content([unit(1, [lesson('u01-l01', ['a', 'b', 'c', 'd', 'e', 'f']), lesson('u01-l02', ['x', 'y'])])])
  it('most overdue first, then lowest strength', () => {
    const p = prog({
      states: {
        a: st({ due: '2026-02-28', strength: 3 }),
        b: st({ due: '2026-02-20', strength: 4 }),
        c: st({ due: '2026-02-28', strength: 1 }),
        d: st({ due: '2026-03-02' }), // not due
        e: st({ due: TODAY, strength: 2 }),
        f: st({ due: '2026-02-25', strength: 5 }),
      },
    })
    const q = buildDailyQueue(c, p, TODAY, {})
    expect(q.reviews).toEqual(['b', 'f', 'c', 'a', 'e'])
    expect(q.dueTotal).toBe(5)
  })
  it('reported item excluded', () => {
    const p = prog({ states: { a: st(), b: st() }, reports: [report('a'), report('x')] })
    const q = buildDailyQueue(c, p, TODAY, {})
    expect(q.reviews).toEqual(['b'])
    expect(q.dueTotal).toBe(1)
    expect(q.newItems).not.toContain('x')
    expect(q.newItems).toContain('y')
  })
  it('a due state for an unknown id (gone-id) is ignored', () => {
    const p = prog({ states: { a: st(), 'gone-id': st({ due: '2020-01-01' }) } })
    const q = buildDailyQueue(c, p, TODAY, {})
    expect(q.reviews).toEqual(['a'])
    expect(q.dueTotal).toBe(1)
  })
  it('a 61st due state for an unknown id does not cause overload', () => {
    const p = withDue(60)
    p.states['gone-id'] = st()
    expect(buildDailyQueue(big, p, TODAY, {}).newItems).toHaveLength(10)
  })
  it('prototype keys are not states', () => {
    const c2 = content([unit(1, [lesson('u01-l01', ['toString', 'constructor'])])])
    const q = buildDailyQueue(c2, prog(), TODAY, {})
    expect(q.reviews).toEqual([])
    expect(q.newItems).toEqual(['toString', 'constructor'])
  })
  it('items that already have a state are not new', () => {
    const p = prog({ states: { a: st({ due: '2026-04-01' }), c: st({ due: '2026-04-01' }) } })
    expect(buildDailyQueue(c, p, TODAY, {}).newItems).toEqual(['b', 'd', 'e', 'f', 'x', 'y'])
  })
})

describe('extra ("Another lesson")', () => {
  it('extra: true → the next lesson\'s stateless items, ignoring the daily limit', () => {
    const p = withDue(0, { days: day({ newIntroduced: 10 }), states: { ...withDue(0).states, n0: st({ due: '2026-04-01' }) } })
    const q = buildDailyQueue(big, p, TODAY, { extra: true })
    expect(q.newItems).toEqual(ids('n', 20).slice(1))
    expect(q.lessonId).toBe('u01-l02')
  })
  it('extra after the lesson is fully started → the following lesson', () => {
    const p = withDue(0, { states: { ...withDue(0).states, ...dueStates(ids('n', 20), { due: '2026-04-01' }) } })
    const q = buildDailyQueue(big, p, TODAY, { extra: true })
    expect(q.newItems).toEqual(ids('m', 20))
    expect(q.lessonId).toBe('u01-l03')
  })
  it('overloaded + extra → none', () => {
    expect(buildDailyQueue(big, withDue(70), TODAY, { extra: true }).newItems).toEqual([])
    expect(buildDailyQueue(big, withDue(5, { days: day({ dueAtStart: 61 }) }), TODAY, { extra: true }).newItems).toEqual([])
  })
})

describe('the path does not stall', () => {
  const c = content([unit(1, [
    lesson('u01-l01', ['a', 'b', 'c']),
    lesson('u01-l02', ['d', 'e', 'f']),
    lesson('u01-l03', ['g', 'h']),
  ])])
  // L1 fully started, b not known yet
  const p = prog({
    states: {
      a: st({ due: '2026-04-01' }),
      b: st({ due: '2026-03-02', known: false, strength: 0 }),
      c: st({ due: '2026-04-01' }),
    },
    settings: { ...prog().settings, newPerDay: 2 },
  })
  it('nextLesson is L1 but new items come from L2', () => {
    expect(nextLesson(c, p)!.id).toBe('u01-l01')
    const q = buildDailyQueue(c, p, TODAY, {})
    expect(q.newItems).toEqual(['d', 'e'])
    expect(q.lessonId).toBe('u01-l02')
  })
  it('extra: true still adds items', () => {
    const q = buildDailyQueue(c, p, TODAY, { extra: true })
    expect(q.newItems).toEqual(['d', 'e', 'f'])
    expect(q.lessonId).toBe('u01-l02')
  })
  it('everything learned → no new items, lessonId null', () => {
    const all = prog({ states: dueStates(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], { due: '2026-04-01' }) })
    const q = buildDailyQueue(c, all, TODAY, { extra: true })
    expect(q).toEqual({ reviews: [], recapIds: [], newItems: [], lessonId: null, dueTotal: 0 })
  })
})

describe('special lessons', () => {
  const c = content([unit(1, [
    lesson('u01-l01', ['a', 'b', 'c', 'd']),
    lesson('u01-l02', [], { recapOf: ['a', 'b', 'c', 'd', 'gone'] }),
    lesson('u01-l03', [], { repeatLines: [{ da: 'hej', en: 'hi' }] }),
    lesson('u01-l04', ['e', 'f']),
  ])])
  const learned = { a: st({ due: '2026-04-01' }), b: st(), c: st({ due: '2026-04-01' }) }

  it('the walk stops at a recap lesson that is not done', () => {
    const p = prog({ states: { a: st({ due: '2026-04-01' }) } })
    const q = buildDailyQueue(c, p, TODAY, {})
    expect(q.newItems).toEqual(['b', 'c', 'd'])
    expect(buildDailyQueue(c, p, TODAY, { extra: true }).newItems).toEqual(['b', 'c', 'd'])
  })
  it('recap lesson next → no new items, recapIds = its started recapOf ids not in reviews', () => {
    const p = prog({ states: learned, reports: [report('d')] })
    expect(nextLesson(c, p)!.id).toBe('u01-l02')
    const q = buildDailyQueue(c, p, TODAY, {})
    expect(q.newItems).toEqual([])
    expect(q.lessonId).toBe('u01-l02')
    expect(q.reviews).toEqual(['b'])
    expect(q.recapIds).toEqual(['a', 'c'])
    const x = buildDailyQueue(c, p, TODAY, { extra: true })
    expect(x.newItems).toEqual([])
    expect(x.lessonId).toBe('u01-l02')
  })
  it('repeat-only lesson next → no new items, lessonId = it', () => {
    const p = prog({ states: learned, reports: [report('d')], lessonsDone: { 'u01-l02': true } })
    const q = buildDailyQueue(c, p, TODAY, {})
    expect(q.newItems).toEqual([])
    expect(q.recapIds).toEqual([])
    expect(q.lessonId).toBe('u01-l03')
    expect(buildDailyQueue(c, p, TODAY, { extra: true }).newItems).toEqual([])
  })
  it('both done → the walk continues past them', () => {
    const p = prog({ states: learned, reports: [report('d')], lessonsDone: { 'u01-l02': true, 'u01-l03': true } })
    const q = buildDailyQueue(c, p, TODAY, {})
    expect(q.newItems).toEqual(['e', 'f'])
    expect(q.lessonId).toBe('u01-l04')
    expect(q.recapIds).toEqual([])
  })
})

describe('review cap while placement items are due (2026-11-25 learner decision)', () => {
  // 150 review candidates so a cap of 100 can show
  const wide = content([unit(1, [lesson('u01-l01', ids('r', 150)), lesson('u01-l02', ids('n', 20))])])
  const placedState = (extra: Partial<ItemState> = {}) => st({ strength: 2, seen: 0, placed: true, ...extra })
  const states = (placedIds: string[], plainIds: string[], later: string[] = []) => ({
    ...Object.fromEntries(later.map(id => [id, placedState({ due: '2026-04-01' })])),
    ...Object.fromEntries(placedIds.map(id => [id, placedState()])),
    ...Object.fromEntries(plainIds.map(id => [id, st()])),
  })
  it('constant', () => expect(BACKLOG_REVIEW_CAP).toBe(100))
  it('120 placement-pending due → 100 reviews', () => {
    const q = buildDailyQueue(wide, prog({ states: states(ids('r', 120), []) }), TODAY, {})
    expect(q.dueTotal).toBe(120)
    expect(q.reviews).toHaveLength(100)
  })
  it('60 due, none placement-pending → 60 reviews', () => {
    const q = buildDailyQueue(wide, prog({ states: states([], ids('r', 60)) }), TODAY, {})
    expect(q.reviews).toHaveLength(REVIEW_CAP)
  })
  it('a mix: 1 placement-pending among 120 due → 100 reviews, both kinds included', () => {
    const plain = ids('r', 120).slice(1)
    const q = buildDailyQueue(wide, prog({ states: states(['r0'], plain) }), TODAY, {})
    expect(q.reviews).toHaveLength(BACKLOG_REVIEW_CAP)
    expect(q.reviews.some(id => id !== 'r0')).toBe(true)
  })
  it('placement-pending items that are not due yet do not raise the cap', () => {
    const q = buildDailyQueue(wide, prog({ states: states([], ids('r', 60), ['r130', 'r131']) }), TODAY, {})
    expect(q.reviews).toHaveLength(REVIEW_CAP)
  })
  it('reviewsDone counts against the higher cap: 70 done → 30 more', () => {
    const q = buildDailyQueue(wide, prog({ states: states(ids('r', 120), []), days: day({ reviewsDone: 70 }) }), TODAY, {})
    expect(q.reviews).toHaveLength(30)
  })
  it('OVERLOAD and MIN_NEW are unchanged: 120 placement-pending due → 3 new', () => {
    const q = buildDailyQueue(wide, prog({ states: states(ids('r', 120), []) }), TODAY, {})
    expect(q.newItems).toHaveLength(MIN_NEW)
  })
})

describe('review cap on any backlog day (2026-11-25 learner decision)', () => {
  const wide = content([unit(1, [lesson('u01-l01', ids('r', 150)), lesson('u01-l02', ids('n', 20))])])
  const plain = (n: number) => Object.fromEntries(ids('r', n).map(id => [id, st()]))
  it('61 due, none placed, no log → 61 reviews (cap 100)', () => {
    const q = buildDailyQueue(wide, prog({ states: plain(61) }), TODAY, {})
    expect(q.reviews).toHaveLength(61)
  })
  it('61 due at start, 90 done → 10 reviews', () => {
    const q = buildDailyQueue(wide, prog({ states: plain(61), days: day({ dueAtStart: 61, reviewsDone: 90 }) }), TODAY, {})
    expect(q.reviews).toHaveLength(10)
  })
  it('60 due, none placed → cap 60', () => {
    const q = buildDailyQueue(wide, prog({ states: plain(60) }), TODAY, {})
    expect(q.reviews).toHaveLength(60)
  })
  it('dueAtStart 60 and 60 done, more due → 0 reviews', () => {
    const q = buildDailyQueue(wide, prog({ states: plain(100), days: day({ dueAtStart: 60, reviewsDone: 60 }) }), TODAY, {})
    expect(q.reviews).toHaveLength(0)
  })
  it('cap follows dueAtStart, not current due: 150 at start, 30 due now, 80 done → 20', () => {
    const q = buildDailyQueue(wide, prog({ states: plain(30), days: day({ dueAtStart: 150, reviewsDone: 80 }) }), TODAY, {})
    expect(q.reviews).toHaveLength(20)
  })
})
