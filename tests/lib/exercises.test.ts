import { describe, it, expect } from 'vitest'
import { makeExercise, type ExerciseKind } from '../../src/lib/exercises'
import { seeded } from '../../src/lib/rng'
import { numberToDanish } from '../../src/lib/danishNumbers'
import { timeToDanish } from '../../src/lib/danishTime'
import type { Item } from '../../src/content/types'

const w = (id: string, da: string, en: string, extra: Partial<Item> = {}): Item => ({
  id, kind: 'word', da, en, ...extra,
})
const gen: Item = {
  id: 'u01-p01-numbers', kind: 'generated', da: 'tal', en: 'numbers GENLABEL',
  generator: { type: 'number', min: 0, max: 20 },
}
const base: Item[] = [
  w('u01-p01-hund', 'en hund', 'a dog', { gender: 'en' }),
  w('u01-p01-kat', 'en kat', 'a cat', { gender: 'en' }),
  w('u01-p01-hus', 'et hus', 'a house', { gender: 'et' }),
  w('u01-p01-bil', 'en bil', 'a car', { gender: 'en' }),
  w('u01-p01-tak', 'tak', 'thanks'),
  w('u02-p01-hej', 'hej', 'hello'),
  gen,
]
const yes = { canPlay: () => true }
const draws = <T,>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i))

describe('recognise', () => {
  const item = w('u01-p02-mad', 'mad', 'food')
  it('yields recognise kinds only; never listen-pick when canPlay false', () => {
    const ok: ExerciseKind[] = ['mc-da-en', 'mc-en-da', 'match', 'listen-pick']
    for (const e of draws(60, (i) => makeExercise(item, 'recognise', base, seeded(i), yes))) expect(ok).toContain(e.kind)
    for (const e of draws(60, (i) => makeExercise(item, 'recognise', base, seeded(i), { canPlay: () => false })))
      expect(e.kind).not.toBe('listen-pick')
  })
  it('mc has 4 distinct options with one correct, and no generated labels', () => {
    let seen = 0
    for (let i = 0; i < 80; i++) {
      const e = makeExercise(item, 'recognise', base, seeded(i), yes)
      if (!e.kind.startsWith('mc') && e.kind !== 'listen-pick') continue
      seen++
      expect(e.options).toHaveLength(4)
      expect(new Set(e.options).size).toBe(4)
      expect(e.options!.filter((o) => e.accepted.includes(o))).toHaveLength(1)
      expect(e.options!.join('|')).not.toContain('GENLABEL')
      expect(e.options).not.toContain('tal')
    }
    expect(seen).toBeGreaterThan(0)
  })
  it('pool of 2 still gives >= 2 distinct options', () => {
    const pool = [base[0], base[1]]
    for (let i = 0; i < 30; i++) {
      const e = makeExercise(item, 'recognise', pool, seeded(i), yes)
      if (e.options) expect(new Set(e.options).size).toBeGreaterThanOrEqual(2)
      expect(e.kind).not.toBe('match')
    }
  })
  it('match lists the item first plus 3-4 fillers, never generated', () => {
    const e = draws(80, (i) => makeExercise(item, 'recognise', base, seeded(i), yes)).find((x) => x.kind === 'match')!
    expect(e.itemIds[0]).toBe(item.id)
    expect(e.itemIds.length).toBeGreaterThanOrEqual(4)
    expect(e.itemIds.length).toBeLessThanOrEqual(5)
    expect(e.itemIds).not.toContain(gen.id)
    expect(e.pairs).toHaveLength(e.itemIds.length)
  })
  it('generated items are never put in match', () => {
    for (let i = 0; i < 40; i++) expect(makeExercise(gen, 'recognise', base, seeded(i), yes).kind).not.toBe('match')
  })
  it('avoids lastKind when alternatives exist', () => {
    for (let i = 0; i < 60; i++)
      expect(makeExercise(item, 'recognise', base, seeded(i), { ...yes, lastKind: 'mc-da-en' }).kind).not.toBe('mc-da-en')
  })
})

describe('assemble', () => {
  it('tiles for a sentence', () => {
    const it1 = w('u01-p03-x', 'kommer', 'come', { sentences: [{ da: 'Jeg kommer fra Spanien.', en: 'I come from Spain.' }] })
    const e = draws(60, (i) => makeExercise(it1, 'assemble', base, seeded(i), yes)).find((x) => x.kind === 'tiles')!
    expect(e).toBeTruthy()
    expect(e.accepted).toEqual(['Jeg kommer fra Spanien'])
    const correct = ['Jeg', 'kommer', 'fra', 'Spanien']
    expect(correct.every((c) => e.tiles!.includes(c))).toBe(true)
    expect(e.tiles).toHaveLength(6)
  })
  it('gap-options distractors drop the article when the gap has none', () => {
    const it1 = w('u01-p03-bil', 'en bil', 'a car', { gender: 'en', sentences: [{ da: 'Jeg har en bil', en: 'I have a car', gap: 'bil' }] })
    let n = 0
    for (let i = 0; i < 80; i++) {
      const e = makeExercise(it1, 'assemble', base, seeded(i), yes)
      if (e.kind !== 'gap-options') continue
      n++
      expect(e.accepted).toEqual(['bil'])
      expect(e.options).toContain('bil')
      expect(new Set(e.options).size).toBe(e.options!.length)
      for (const o of e.options!) expect(/^(en|et) /.test(o)).toBe(false)
      expect(e.prompt).toContain('Jeg har en ___')
    }
    expect(n).toBeGreaterThan(0)
  })
  it('noun without sentences can yield pick-article; produce accepts article form', () => {
    const noun = w('u01-p03-bil', 'en bil', 'a car', { gender: 'en' })
    const e = draws(40, (i) => makeExercise(noun, 'assemble', base, seeded(i), yes)).find((x) => x.kind === 'pick-article')!
    expect(e.options).toEqual(['en', 'et'])
    expect(e.accepted).toEqual(['en'])
    const p = makeExercise(noun, 'produce', base, seeded(1), { canPlay: () => false })
    expect(p.kind).toBe('type-da')
    expect(p.accepted).toContain('en bil')
    expect(p.accepted).not.toContain('bil')
    expect(p.gender).toBe('en')
  })
  it('non-noun without sentences falls back to mc', () => {
    const e = makeExercise(w('u01-p03-tak', 'tak', 'thanks'), 'assemble', base, seeded(3), yes)
    expect(['mc-da-en', 'mc-en-da']).toContain(e.kind)
  })
})

describe('produce', () => {
  const item = w('u01-p04-x', 'spiste', 'ate', { sentences: [{ da: 'Jeg spiste morgenmad', en: 'I ate breakfast', gap: 'spiste' }] })
  it('type-gap appears with ___ prompt, never without gap sentences', () => {
    const es = draws(50, (i) => makeExercise(item, 'produce', base, seeded(i), yes))
    const g = es.find((e) => e.kind === 'type-gap')!
    expect(g).toBeTruthy()
    expect(g.prompt).toContain('Jeg ___ morgenmad')
    expect(g.prompt).toContain('I ate breakfast')
    expect(g.accepted).toEqual(['spiste'])
    const plain = w('u01-p04-y', 'hej', 'hello', { sentences: [{ da: 'Hej Peter', en: 'Hi Peter' }] })
    for (let i = 0; i < 50; i++) expect(makeExercise(plain, 'produce', base, seeded(i), yes).kind).not.toBe('type-gap')
  })
  it('strength-3 kinds are produce kinds', () => {
    for (let i = 0; i < 50; i++) expect(['type-da', 'listen-type', 'type-gap']).toContain(makeExercise(item, 'produce', base, seeded(i), yes).kind)
  })
  it('type-da prompt shows English', () => {
    const e = makeExercise(w('u01-p04-z', 'tak', 'thanks'), 'produce', base, seeded(1), { canPlay: () => false })
    expect(e.prompt).toContain('thanks')
    expect(e.accepted).toEqual(['tak'])
  })
})

describe('listening with sentences', () => {
  const s1 = { da: 'Jeg spiser brød', en: 'I eat bread' }
  const s2 = { da: 'Vi spiser fisk', en: 'We eat fish' }
  const item = w('u01-p05-spise', 'spise', 'eat', { sentences: [s1, s2] })
  it('listen-type plays item or sentence', () => {
    const es = draws(50, (i) => makeExercise(item, 'produce', [], seeded(i), yes)).filter((e) => e.kind === 'listen-type')
    expect(es.some((e) => e.speak === 'spise' && !e.sentence)).toBe(true)
    expect(es.some((e) => e.sentence && [s1.da, s2.da].includes(e.speak!))).toBe(true)
    for (const e of es) {
      expect(e.accepted).toEqual([e.speak])
      if (e.speak === 'spise') expect(e.sentence).toBeFalsy()
    }
  })
  it('plays the item when sentences cannot be played', () => {
    const es = draws(50, (i) => makeExercise(item, 'produce', [], seeded(i), { canPlay: (d) => d === 'spise' }))
    for (const e of es) if (e.kind === 'listen-type') { expect(e.speak).toBe('spise'); expect(e.sentence).toBeFalsy() }
  })
  const others = (n: number): Item[] =>
    draws(n, (i) => w(`u01-p05-o${i}`, `o${i}`, `other${i}`, { sentences: [{ da: `Sætning ${i}`, en: `Sentence ${i}` }] }))
  it('listen-pick with 4 other sentence items picks an English sentence', () => {
    const es = draws(80, (i) => makeExercise(item, 'recognise', others(4), seeded(i), yes)).filter((e) => e.kind === 'listen-pick')
    const sent = es.filter((e) => e.speak === s1.da || e.speak === s2.da)
    expect(sent.length).toBeGreaterThan(0)
    for (const e of sent) {
      expect(e.options).toHaveLength(4)
      expect(new Set(e.options).size).toBe(4)
      expect(e.accepted).toHaveLength(1)
      expect(e.options).toContain(e.accepted[0])
    }
  })
  it('listen-pick with only 2 other sentence items plays the item', () => {
    const es = draws(80, (i) => makeExercise(item, 'recognise', others(2), seeded(i), yes)).filter((e) => e.kind === 'listen-pick')
    expect(es.length).toBeGreaterThan(0)
    for (const e of es) expect(e.speak).toBe('spise')
  })
})

describe('generated items', () => {
  it('number produce is always type-da with digits', () => {
    for (let i = 0; i < 50; i++) {
      const e = makeExercise(gen, 'produce', base, seeded(i), yes)
      expect(e.kind).toBe('type-da')
      const v = Number(e.shown!.en)
      expect(e.prompt).toContain(String(v))
      for (const a of numberToDanish(v).accepted) expect(e.accepted).toContain(a)
    }
  })
  it('number recognise: 4 distinct Danish words options', () => {
    const e = makeExercise(gen, 'recognise', base, seeded(2), yes)
    expect(e.options).toHaveLength(4)
    expect(new Set(e.options).size).toBe(4)
    expect(e.options).toContain(numberToDanish(Number(e.shown!.en)).primary)
  })
  it('number assemble: tiles', () => {
    const e = makeExercise(gen, 'assemble', base, seeded(5), yes)
    expect(e.kind).toBe('tiles')
    expect(e.accepted).toEqual([e.shown!.da])
  })
  it('time generator draws only :15/:45 and mc options are distinct', () => {
    const t: Item = { id: 'u02-p01-time', kind: 'generated', da: 'klokken', en: 'time', generator: { type: 'time', minutes: [15, 45] } }
    for (let i = 0; i < 40; i++) {
      const p = makeExercise(t, 'produce', base, seeded(i), yes)
      const [h, m] = p.shown!.en.split(':').map(Number)
      expect([15, 45]).toContain(m)
      expect(h).toBeGreaterThanOrEqual(1)
      expect(h).toBeLessThanOrEqual(12)
      for (const a of timeToDanish(h, m).accepted) expect(p.accepted).toContain(a)
      const r = makeExercise(t, 'recognise', base, seeded(i), yes)
      expect(r.options).toHaveLength(4)
      expect(new Set(r.options).size).toBe(4)
    }
  })
})
