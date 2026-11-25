import { describe, it, expect } from 'vitest'
import { SessionRunner } from '../../src/lib/sessionRunner'
import { seeded } from '../../src/lib/rng'
import { review, type ItemState } from '../../src/lib/srs'
import type { Content, Item } from '../../src/content/types'

const w = (id: string, da: string, en: string): Item => ({ id, kind: 'word', da, en })
const items: Item[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((l, i) =>
  w(`u01-p0${i}-${l.toLowerCase()}`, `da${l}`, `en${l}`),
)
const id = (l: string) => items.find((i) => i.da === `da${l}`)!.id
const content: Content = {
  version: 'x', hashes: {},
  units: [{ id: 'u01', order: 1, title: '', subtitle: '', pages: [], lessons: [{ id: 'u01-l01', title: '', pages: [], taughtInClass: true, items }] }],
}
const TODAY = '2026-01-10'
const st = (strength: number, due = '2026-01-01', extra: Partial<ItemState> = {}): ItemState => ({
  strength, due, lapses: 0, seen: 3, known: true, ...extra,
})
const mk = (ids: string[], states: Record<string, ItemState>, o: Partial<{ mode: 'scheduled' | 'off-schedule'; level: 'produce' }> = {}) =>
  new SessionRunner(content, states, ids, seeded(1), { canPlay: () => true, mode: o.mode ?? 'scheduled', pool: items, level: o.level })
const all = (s: number) => Object.fromEntries(items.map((i) => [i.id, st(s)]))

describe('SessionRunner', () => {
  it('throws if an id has no state', () => {
    expect(() => mk([id('A')], {})).toThrow()
  })

  it('applies review on correct answers and ends', () => {
    const states = all(3)
    const r = mk([id('A')], states, { level: 'produce' })
    expect(r.current()!.itemIds[0]).toBe(id('A'))
    const out = r.answer('correct', TODAY)
    expect(out.states[id('A')]).toEqual(review(states[id('A')], 'correct', TODAY))
    expect(states[id('A')].strength).toBe(3)
    expect(r.current()).toBeNull()
    expect(r.remaining()).toBe(0)
  })

  it('keeps current() stable until answer', () => {
    const r = mk([id('A'), id('B')], all(0))
    expect(r.current()).toBe(r.current())
  })

  it('re-queues a wrong answer 3 later; re-ask correct only sets known and seen', () => {
    const states = all(0)
    states[id('A')] = st(0, '2026-01-01', { known: false, seen: 0 })
    const r = mk([id('A'), id('B'), id('C'), id('D'), id('E')], states, { level: 'produce' })
    let out = r.answer('wrong', TODAY)
    const afterWrong = out.states[id('A')]
    expect(afterWrong).toEqual(review(states[id('A')], 'wrong', TODAY))
    expect(r.remaining()).toBe(5)
    const seen: string[] = []
    while (r.current()) { seen.push(r.current()!.itemIds[0]); out = r.answer('correct', TODAY) }
    expect(seen.indexOf(id('A'))).toBe(3)
    const fin = out.states[id('A')]
    expect(fin.strength).toBe(afterWrong.strength)
    expect(fin.due).toBe(afterWrong.due)
    expect(fin.known).toBe(true)
    expect(fin.seen).toBe(afterWrong.seen + 1)
  })

  it('re-queues at the end when fewer remain', () => {
    const r = mk([id('A'), id('B')], all(0), { level: 'produce' })
    r.answer('wrong', TODAY)
    expect(r.current()!.itemIds[0]).toBe(id('B'))
    r.answer('correct', TODAY)
    expect(r.current()!.itemIds[0]).toBe(id('A'))
  })

  it('drop removes pending exercises', () => {
    const r = mk([id('A'), id('B'), id('C')], all(0), { level: 'produce' })
    r.answer('wrong', TODAY)
    r.drop(id('A'))
    r.drop(id('B'))
    expect(r.remaining()).toBe(1)
    expect(r.current()!.itemIds[0]).toBe(id('C'))
  })

  it('undoLast restores state from before the answer', () => {
    const states = all(0)
    states[id('A')] = st(5, '2026-02-01')
    const r = mk([id('A'), id('B')], states, { level: 'produce' })
    r.answer('wrong', TODAY)
    const out = r.undoLast(id('A'))
    expect(out.states[id('A')]).toEqual(st(5, '2026-02-01'))
    expect(r.remaining()).toBe(1)
  })

  it('undoLast after wrong twice restores the original', () => {
    const states = all(0)
    states[id('A')] = st(5, '2026-02-01')
    const r = mk([id('A')], states, { level: 'produce' })
    r.answer('wrong', TODAY)
    r.answer('wrong', TODAY)
    expect(r.undoLast(id('A')).states[id('A')]).toEqual(st(5, '2026-02-01'))
    expect(r.current()).toBeNull()
  })

  it('undoLast after a correct answer restores pre-answer state', () => {
    const states = all(2)
    const r = mk([id('A')], states, { level: 'produce' })
    r.answer('correct', TODAY)
    expect(r.undoLast(id('A')).states[id('A')]).toEqual(states[id('A')])
  })

  it('off-schedule: correct unchanged, wrong reviewed', () => {
    const states = all(3)
    const r = mk([id('A'), id('B')], states, { mode: 'off-schedule', level: 'produce' })
    expect(r.answer('correct', TODAY).states[id('A')]).toEqual(states[id('A')])
    expect(r.answer('wrong', TODAY).states[id('B')]).toEqual(review(states[id('B')], 'wrong', TODAY))
  })

  it('level produce yields only produce kinds', () => {
    const r = mk(items.map((i) => i.id), all(0), { level: 'produce' })
    while (r.current()) {
      expect(['type-da', 'listen-type', 'type-gap']).toContain(r.current()!.kind)
      r.answer('correct', TODAY)
    }
  })

  it('match grades queued ids only, never fillers', () => {
    const states = all(0)
    let found = false
    for (let seed = 1; seed < 200 && !found; seed++) {
      const queued = [id('A'), id('B')]
      const r = new SessionRunner(content, states, queued, seeded(seed), { canPlay: () => true, mode: 'scheduled', pool: items })
      const ex = r.current()!
      if (ex.kind !== 'match') continue
      found = true
      expect(ex.itemIds.length).toBeGreaterThanOrEqual(4)
      const inQueue = ex.itemIds.filter((x) => queued.includes(x))
      const out = r.answer('correct', TODAY)
      for (const i of items) {
        const expected = inQueue.includes(i.id) ? review(states[i.id], 'correct', TODAY) : states[i.id]
        expect(out.states[i.id]).toEqual(expected)
      }
      expect(r.remaining()).toBe(queued.length - inQueue.length)
    }
    expect(found).toBe(true)
  })

  it('penalises a wrong answer once; second wrong only adds seen and re-queues', () => {
    const states = all(0)
    states[id('A')] = st(5, '2026-02-01')
    const r = mk([id('A')], states, { level: 'produce' })
    const first = r.answer('wrong', TODAY).states[id('A')]
    expect(first.strength).toBe(1)
    expect(first.lapses).toBe(1)
    const second = r.answer('wrong', TODAY).states[id('A')]
    expect(second).toEqual({ ...first, seen: first.seen + 1 })
    expect(r.remaining()).toBe(1)
  })

  const matchRunner = (states: Record<string, ItemState>) => {
    for (let seed = 1; seed < 200; seed++) {
      const queued = [id('A'), id('B')]
      const r = new SessionRunner(content, states, queued, seeded(seed), { canPlay: () => true, mode: 'scheduled', pool: items })
      const ex = r.current()!
      const graded = ex.itemIds.filter((x) => queued.includes(x))
      if (ex.kind === "match" && graded.length === 2) return { r, graded }
    }
    throw new Error('no match found')
  }

  it('wrong match re-queues all graded ids; later wrong does not penalise again', () => {
    const states = all(0)
    const { r, graded } = matchRunner(states)
    expect(graded.length).toBe(2)
    const out = r.answer('wrong', TODAY).states
    expect(r.remaining()).toBe(2)
    const g = graded[0]
    expect(out[g]).toEqual(review(states[g], 'wrong', TODAY))
    const head = r.current()!.itemIds[0]
    expect(graded).toContain(head)
    const after = r.answer('wrong', TODAY).states
    expect(after[head]).toEqual({ ...out[head], seen: out[head].seen + 1 })
  })

  it('a wrong match grades only the missed ids wrong; pairs matched right are correct', () => {
    const states = all(1)
    const { r, graded } = matchRunner(states)
    const [miss, hit] = graded
    const out = r.answer('wrong', TODAY, [miss]).states
    expect(out[miss]).toEqual(review(states[miss], 'wrong', TODAY))
    expect(out[hit]).toEqual(review(states[hit], 'correct', TODAY))
    // only the missed id is asked again
    expect(r.remaining()).toBe(1)
    expect(r.current()!.itemIds[0]).toBe(miss)
  })

  it('undoLast after a per-pair match restores both the missed and the right pair', () => {
    const states = all(1)
    const { r, graded } = matchRunner(states)
    r.answer('wrong', TODAY, [graded[0]])
    expect(r.undoLast(graded[0]).states[graded[0]]).toEqual(states[graded[0]])
    expect(r.undoLast(graded[1]).states[graded[1]]).toEqual(states[graded[1]])
  })

  it('undoLast on an id graded inside a match restores its pre-wrong state', () => {
    const states = all(0)
    const { r, graded } = matchRunner(states)
    r.answer('wrong', TODAY)
    const out = r.undoLast(graded[1])
    expect(out.states[graded[1]]).toEqual(states[graded[1]])
    expect(r.remaining()).toBe(1)
  })

  it('off-schedule: wrong then correct re-ask sets known and seen only', () => {
    const states = all(3)
    states[id('A')] = st(3, '2026-02-01', { known: false })
    const r = mk([id('A')], states, { mode: 'off-schedule', level: 'produce' })
    const w1 = r.answer('wrong', TODAY).states[id('A')]
    const w2 = r.answer('correct', TODAY).states[id('A')]
    expect(w2).toEqual({ ...w1, known: true, seen: w1.seen + 1 })
  })
})

describe('a dropped (reported) id leaves the pool too (found by the e2e learner, Task 23b)', () => {
  it('never comes back as a match pair or an option after drop', () => {
    // 7 items, level recognise: many matches and multiple-choice options draw from the pool
    const states = all(1)
    const queue = items.map(i => i.id).filter(x => x !== id('G'))
    const r = new SessionRunner(content, states, queue, seeded(3), { canPlay: () => false, mode: 'scheduled', pool: items, level: 'recognise' })
    r.drop(id('G'))
    const gone = id('G')
    for (let n = 0; n < 40 && r.current(); n++) {
      const ex = r.current()!
      expect(ex.itemIds).not.toContain(gone)
      expect(ex.pairs?.map(p => p.da) ?? []).not.toContain('daG')
      expect(ex.options ?? []).not.toContain('daG')
      expect(ex.options ?? []).not.toContain('enG')
      r.answer(n % 3 === 0 ? 'wrong' : 'correct', TODAY)
    }
  })
  it('undoLast (a report on a wrong answer) also leaves the pool', () => {
    const r = new SessionRunner(content, all(1), items.map(i => i.id), seeded(5), { canPlay: () => false, mode: 'scheduled', pool: items, level: 'recognise' })
    const first = r.current()!.itemIds[0]
    r.answer('wrong', TODAY)
    r.undoLast(first)
    for (let n = 0; n < 40 && r.current(); n++) {
      const ex = r.current()!
      expect(ex.itemIds).not.toContain(first)
      r.answer('correct', TODAY)
    }
  })
})
