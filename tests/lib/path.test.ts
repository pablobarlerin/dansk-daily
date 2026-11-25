import { describe, it, expect } from 'vitest'
import type { Content, Item, Lesson, Unit, RepeatLine } from '../../src/content/types'
import type { Progress } from '../../src/lib/progressTypes'
import type { ItemState } from '../../src/lib/srs'
import {
  MASTERY_TARGET, allItems, findItem, isLessonDone, pathOrder, nextLesson,
  unitMastery, weakItems, lessonSession, repeatRound,
} from '../../src/lib/path'

const item = (id: string): Item => ({ id, kind: 'word', da: id, en: id })
const lesson = (id: string, itemIds: string[], extra: Partial<Lesson> = {}): Lesson => ({
  id, title: id, pages: [1], taughtInClass: true, items: itemIds.map(item), ...extra,
})
const unit = (n: number, lessons: Lesson[]): Unit => ({
  id: `u${n}`, order: n, title: `U${n}`, subtitle: '', pages: [1], lessons,
})
const content = (units: Unit[]): Content => ({ version: 'v', units, hashes: {} })
const st = (strength: number, extra: Partial<ItemState> = {}): ItemState => ({
  strength, due: '2026-01-01', lapses: 0, seen: 1, known: false, ...extra,
} as ItemState)
const prog = (extra: Partial<Progress> = {}): Progress => ({
  schemaVersion: 1, firstUse: '2026-01-01', states: {}, lessonsDone: {}, repeatsSeen: {},
  placement: { done: true, startUnitId: null }, days: {}, reports: [],
  settings: { audio: true, speed: 1, newPerDay: 8, backupNudge: true },
  lastBackupNudge: null, contentVersion: null, ...extra,
})
const report = (id: string) => ({ itemId: id, unitId: 'u1', da: '', en: '', note: '', day: '2026-01-01', itemHash: '' })

const c = content([
  unit(1, [lesson('u01-l01', ['a', 'b']), lesson('u01-l02', ['c'])]),
  unit(2, [lesson('u02-l01', ['d']), lesson('u02-l02', [], { recapOf: ['a', 'd'] })]),
  unit(3, [lesson('u03-l01', [], { repeatLines: [{ da: 'x', en: 'x' }] }), lesson('u03-l02', ['e'])]),
])

describe('basics', () => {
  it('target', () => expect(MASTERY_TARGET).toBe(0.8))
  it('allItems and findItem', () => {
    expect(allItems(c).map(i => i.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    const f = findItem(c, 'd')!
    expect(f.item.id).toBe('d')
    expect(f.lesson.id).toBe('u02-l01')
    expect(f.unit.id).toBe('u2')
    expect(findItem(c, 'nope')).toBeNull()
  })
})

describe('pathOrder / nextLesson', () => {
  it('starts at startUnitId then wraps to earlier units', () => {
    const p = prog({ placement: { done: true, startUnitId: 'u2' } })
    expect(pathOrder(c, p).map(l => l.id)).toEqual(['u02-l01', 'u02-l02', 'u03-l01', 'u03-l02', 'u01-l01', 'u01-l02'])
  })
  it('null or unknown start uses unit 1', () => {
    expect(pathOrder(c, prog())[0].id).toBe('u01-l01')
    expect(pathOrder(c, prog({ placement: { done: true, startUnitId: 'zzz' } }))[0].id).toBe('u01-l01')
  })
  it('respects startUnitId', () => {
    expect(nextLesson(c, prog({ placement: { done: true, startUnitId: 'u3' } }))!.id).toBe('u03-l01')
  })
  it('skips lessons with all items known', () => {
    const p = prog({ states: { a: st(5, { known: true }), b: st(5, { known: true }) } })
    expect(nextLesson(c, p)!.id).toBe('u01-l02')
  })
  it('a state that is not known does not complete', () => {
    const p = prog({ states: { a: st(5, { known: true }), b: st(5) } })
    expect(nextLesson(c, p)!.id).toBe('u01-l01')
  })
  it('recap and repeat-only lessons need lessonsDone', () => {
    const l = c.units[1].lessons[1]
    const r = c.units[2].lessons[0]
    expect(isLessonDone(l, prog())).toBe(false)
    expect(isLessonDone(l, prog({ lessonsDone: { 'u02-l02': true } }))).toBe(true)
    expect(isLessonDone(r, prog())).toBe(false)
    expect(isLessonDone(r, prog({ lessonsDone: { 'u03-l01': true } }))).toBe(true)
  })
  it('lesson whose only unknown item is reported is done', () => {
    const p = prog({ states: { a: st(5, { known: true }) }, reports: [report('b')] })
    expect(isLessonDone(c.units[0].lessons[0], p)).toBe(true)
  })
  it('all-reported lesson is done', () => {
    expect(isLessonDone(c.units[0].lessons[1], prog({ reports: [report('c')] }))).toBe(true)
  })
  it('all done -> null; unknown-id states ignored', () => {
    const states: Record<string, ItemState> = { 'gone-id': st(5, { known: true }) }
    for (const i of allItems(c)) states[i.id] = st(5, { known: true })
    const lessonsDone = { 'u02-l02': true as const, 'u03-l01': true as const }
    expect(nextLesson(c, prog({ states, lessonsDone }))).toBeNull()
    expect(nextLesson(c, prog({ states: { 'gone-id': st(5, { known: true }) } }))!.id).toBe('u01-l01')
  })
  it('placement done with null start gives first not-done', () => {
    expect(nextLesson(c, prog({ placement: { done: true, startUnitId: null } }))!.id).toBe('u01-l01')
  })
  it('odd keys never count', () => {
    const states = Object.create({ a: st(5, { known: true }) }) as Record<string, ItemState>
    expect(isLessonDone(c.units[0].lessons[0], prog({ states }))).toBe(false)
  })
})

describe('unitMastery', () => {
  const ten = unit(1, [lesson('u01-l01', Array.from({ length: 10 }, (_, i) => `m${i}`))])
  const mk = (n: number) => {
    const states: Record<string, ItemState> = {}
    for (let i = 0; i < 10; i++) states[`m${i}`] = st(i < n ? 4 : 3)
    return states
  }
  it('empty unit is 0', () => expect(unitMastery(unit(9, []), prog())).toBe(0))
  it('8 of 10 -> 0.8', () => expect(unitMastery(ten, prog({ states: mk(8) }))).toBeGreaterThanOrEqual(MASTERY_TARGET))
  it('7 of 10 -> below', () => expect(unitMastery(ten, prog({ states: mk(7) }))).toBeLessThan(MASTERY_TARGET))
  it('reported item leaves denominator', () => {
    const states = mk(7)
    states.m9 = st(0)
    expect(unitMastery(ten, prog({ states, reports: [report('m9')] }))).toBeCloseTo(7 / 9)
  })
  it('unknown-id state changes nothing', () => {
    const states = { ...mk(8), 'gone-id': st(5) }
    expect(unitMastery(ten, prog({ states }))).toBeCloseTo(0.8)
  })
  it('recap items are excluded', () => {
    const u = unit(1, [lesson('u01-l01', ['x']), lesson('u01-l02', ['y'], { recapOf: ['x'] })])
    expect(unitMastery(u, prog({ states: { x: st(4), y: st(0) } }))).toBe(1)
  })
})

describe('weakItems', () => {
  it('orders by strength then lapses, excludes reported and stateless', () => {
    const p = prog({
      states: { a: st(2), b: st(1, { lapses: 1 }), c: st(1, { lapses: 3 }), d: st(0), e: st(3) },
      reports: [report('d')],
    })
    expect(weakItems(c, p, 3)).toEqual(['c', 'b', 'a'])
  })
})

describe('lessonSession', () => {
  it('splits new / practise, skipping reported', () => {
    const cc = content([unit(1, [lesson('u01-l01', ['a', 'b', 'c', 'd'])])])
    const p = prog({ states: { a: st(1) }, reports: [report('d')], settings: { audio: true, speed: 1, newPerDay: 3, backupNudge: true } })
    expect(lessonSession(cc, p, 'u01-l01')).toEqual({ newItems: ['b', 'c'], practiseIds: ['a'] })
  })
  it('recap lesson practises started recapOf ids', () => {
    const p = prog({ states: { a: st(1) }, reports: [report('d')] })
    expect(lessonSession(c, p, 'u02-l02')).toEqual({ newItems: [], practiseIds: ['a'] })
  })
  it('unknown lesson is empty', () => {
    expect(lessonSession(c, prog(), 'nope')).toEqual({ newItems: [], practiseIds: [] })
  })
})

describe('repeatRound', () => {
  const line = (s: string): RepeatLine => ({ da: s, en: s })
  const rc = content([
    unit(1, [lesson('u01-l01', ['a'], { repeatLines: [line('1'), line('2')] })]),
    unit(2, [lesson('u02-l01', ['b'], { repeatLines: [line('3')] })]),
    unit(3, [lesson('u03-l01', ['c'], { repeatLines: [line('4')] })]),
  ])
  it('only started lessons', () => {
    const p = prog({ states: { b: st(1) } })
    expect(repeatRound(rc, p, 10, '2026-02-01').map(r => r.key)).toEqual(['u02-l01#r0'])
  })
  it('lessonsDone and repeatsSeen start a lesson', () => {
    const p = prog({ lessonsDone: { 'u03-l01': true }, repeatsSeen: { 'u01-l01#r1': '2026-01-05' } })
    expect(repeatRound(rc, p, 10, '2026-02-01').map(r => r.key)).toEqual(['u01-l01#r0', 'u03-l01#r0', 'u01-l01#r1'])
  })
  it('never-shown first, then oldest; excludes today; at most n', () => {
    const p = prog({
      states: { a: st(1), b: st(1) },
      repeatsSeen: { 'u01-l01#r0': '2026-01-10', 'u01-l01#r1': '2026-02-01' },
    })
    const all = repeatRound(rc, p, 10, '2026-02-01')
    expect(all.map(r => r.key)).toEqual(['u02-l01#r0', 'u01-l01#r0'])
    expect(all[0].line.da).toBe('3')
    expect(repeatRound(rc, p, 1, '2026-02-01')).toHaveLength(1)
  })
})
