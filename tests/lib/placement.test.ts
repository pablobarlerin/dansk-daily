import { describe, it, expect } from 'vitest'
import type { Content, Item, Lesson, Unit } from '../../src/content/types'
import type { Progress } from '../../src/lib/progressTypes'
import type { ItemState } from '../../src/lib/srs'
import { seeded } from '../../src/lib/rng'
import { PER_UNIT, PASS, PLACEMENT_PER_DAY, placementQuestions, applyPlacement } from '../../src/lib/placement'

const item = (id: string, extra: Partial<Item> = {}): Item => ({ id, kind: 'word', da: id, en: id, ...extra })
const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i}`)
const lesson = (id: string, itemIds: string[], extra: Partial<Lesson> = {}): Lesson => ({
  id, title: id, pages: [1], taughtInClass: true, items: itemIds.map(i => item(i)), ...extra,
})
const unit = (n: number, lessons: Lesson[]): Unit => ({
  id: `u${n}`, order: n, title: `U${n}`, subtitle: '', pages: [1], lessons,
})
const content = (units: Unit[]): Content => ({ version: 'v', units, hashes: {} })
const prog = (extra: Partial<Progress> = {}): Progress => ({
  schemaVersion: 1, firstUse: '2026-01-01', states: {}, lessonsDone: {}, repeatsSeen: {},
  placement: { done: false, startUnitId: null }, days: {}, reports: [],
  settings: { audio: true, speed: 1, newPerDay: 8, backupNudge: true },
  lastBackupNudge: null, contentVersion: null, ...extra,
})
const TODAY = '2026-03-01'

describe('constants', () => {
  it('values', () => {
    expect([PER_UNIT, PASS, PLACEMENT_PER_DAY]).toEqual([6, 0.8, 50])
  })
})

describe('placementQuestions', () => {
  it('asks only taught items when enough', () => {
    const c = content([unit(1, [lesson('l1', ids('t', 10)), lesson('l2', ids('s', 10), { taughtInClass: false })])])
    const q = placementQuestions(c, prog(), seeded(1))
    expect(q.u1).toHaveLength(6)
    expect(q.u1.every(i => i.startsWith('t'))).toBe(true)
  })
  it('tops up from skipped lessons', () => {
    const c = content([unit(1, [lesson('l1', ids('t', 3)), lesson('l2', ids('s', 10), { taughtInClass: false })])])
    const q = placementQuestions(c, prog(), seeded(1)).u1
    expect(q).toHaveLength(6)
    expect(q.filter(i => i.startsWith('t'))).toHaveLength(3)
    expect(q.filter(i => i.startsWith('s'))).toHaveLength(3)
  })
  it('small unit asks all; empty unit left out', () => {
    const c = content([unit(1, [lesson('l1', ids('a', 3))]), unit(2, [lesson('l2', [], { recapOf: ['a0'] })])])
    const q = placementQuestions(c, prog(), seeded(1))
    expect(q.u1).toHaveLength(3)
    expect(q.u2).toBeUndefined()
  })
  it('skips reported items', () => {
    const c = content([unit(1, [lesson('l1', ids('a', 8))])])
    const p = prog({ reports: ['a0', 'a1', 'a2'].map(itemId => ({ itemId, unitId: 'u1', da: '', en: '', note: '', day: TODAY, itemHash: '' })) })
    const q = placementQuestions(c, p, seeded(3)).u1
    expect(q).toHaveLength(5)
    expect(q.some(i => ['a0', 'a1', 'a2'].includes(i))).toBe(false)
  })
  it('includes generated items', () => {
    const times: Item[] = ids('time', 4).map(id => item(id, { kind: 'generated', generator: { type: 'time', minutes: [0] } }))
    const c = content([unit(1, [{ ...lesson('l1', []), items: times }])])
    expect(placementQuestions(c, prog(), seeded(1)).u1).toHaveLength(4)
  })
  it('is deterministic for a seed', () => {
    const c = content([unit(1, [lesson('l1', ids('a', 20))])])
    expect(placementQuestions(c, prog(), seeded(7))).toEqual(placementQuestions(c, prog(), seeded(7)))
  })
})

describe('applyPlacement', () => {
  const c = content([
    unit(1, [lesson('l1', ids('a', 5)), lesson('l2', ['sk0', 'sk1'], { taughtInClass: false })]),
    unit(2, [lesson('l3', ids('b', 6))]),
  ])
  it('passed unit: correct 3, wrong and untested taught 2, skipped untested none, skipped correct 3', () => {
    const questions = { u1: ['a0', 'a1', 'a2', 'a3', 'a4', 'sk0'] }
    const answers = { a0: true, a1: true, a2: true, a3: true, a4: false, sk0: true }
    const r = applyPlacement(c, {}, questions, answers, TODAY)
    expect(r.unitScores.u1).toBeCloseTo(5 / 6)
    expect(r.states.a0.strength).toBe(3)
    expect(r.states.a4.strength).toBe(2)
    expect(r.states.sk0.strength).toBe(3)
    expect(r.states.sk1).toBeUndefined()
    expect(r.states.b0.strength).toBe(2) // unit 2 has no questions: passed
    expect(r.startUnitId).toBeNull()
  })
  it('failed unit: only correct get 3; start at first failed', () => {
    const questions = { u2: ids('b', 6) }
    const answers = { b0: true, b1: true, b2: true, b3: true, b4: false, b5: false }
    const r = applyPlacement(c, {}, questions, answers, TODAY)
    expect(r.unitScores.u2).toBeCloseTo(4 / 6)
    expect(r.states.b0.strength).toBe(3)
    expect(r.states.b4).toBeUndefined()
    expect(r.startUnitId).toBe('u2')
  })
  it('130 items: 50/50/30, none today', () => {
    const big = content([unit(1, [lesson('l', ids('x', 130))])])
    const r = applyPlacement(big, {}, {}, {}, TODAY)
    const dues = Object.values(r.states).map(s => s.due)
    expect(dues.filter(d => d === '2026-03-02')).toHaveLength(50)
    expect(dues.filter(d => d === '2026-03-03')).toHaveLength(50)
    expect(dues.filter(d => d === '2026-03-04')).toHaveLength(30)
    expect(dues.includes(TODAY)).toBe(false)
  })
  it('strength 2 placed before 3', () => {
    const many = content([unit(1, [lesson('l', ids('m', 60))])])
    const r = applyPlacement(many, {}, { u1: ['m59'] }, { m59: true }, TODAY)
    // 1/1 correct passes: m59 -> 3, others -> 2; 59 strength-2 items first, then m59
    expect(r.states.m59.strength).toBe(3)
    expect(r.states.m59.due).toBe('2026-03-03')
    expect(r.states.m0.due).toBe('2026-03-02')
    expect(r.states.m49.due).toBe('2026-03-02')
    expect(r.states.m50.due).toBe('2026-03-03')
  })
  it('never lowers: existing strength 4 stays; equal kept exactly; input unmutated', () => {
    const existing: Record<string, ItemState> = {
      a0: { strength: 4, due: '2026-05-05', lapses: 1, seen: 9, known: true },
      a1: { strength: 3, due: '2026-04-04', lapses: 0, seen: 2, known: true },
    }
    const snap = JSON.parse(JSON.stringify(existing))
    const cc = content([unit(1, [lesson('l', ['a0', 'a1', 'a2'])])])
    const r = applyPlacement(cc, existing, { u1: ['a0', 'a1', 'a2'] }, { a0: false, a1: true, a2: true }, TODAY)
    expect(r.states.a0).toEqual(existing.a0)
    expect(r.states.a1).toEqual(existing.a1)
    expect(r.states.a2.strength).toBe(3)
    expect(existing).toEqual(snap)
  })
})

describe('applyPlacement marks placed items placement-pending', () => {
  it('every placed state has placed: true; existing states kept as they are', () => {
    const existing: Record<string, ItemState> = { a0: { strength: 4, due: '2026-05-05', lapses: 1, seen: 9, known: true } }
    const cc = content([unit(1, [lesson('l', ['a0', 'a1', 'a2'])])])
    const r = applyPlacement(cc, existing, { u1: ['a0', 'a1', 'a2'] }, { a0: true, a1: true, a2: true }, TODAY)
    expect(r.states.a1.placed).toBe(true)
    expect(r.states.a2.placed).toBe(true)
    expect(r.states.a0).toEqual(existing.a0)
  })
})
