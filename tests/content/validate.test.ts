import { describe, expect, it } from 'vitest'
import type { Item, Lesson, Unit } from '../../src/content/types'
import { validateContent } from '../../src/content/validate'

const item = (over: Partial<Item> = {}): Item => ({
  id: 'u01-p06-hej', kind: 'word', da: 'hej', en: 'hi', ...over,
})
const lesson = (over: Partial<Lesson> = {}): Lesson => ({
  id: 'u01-l01', title: 'Greetings', pages: [6], taughtInClass: true, items: [item()], ...over,
})
const unit = (over: Partial<Unit> = {}): Unit => ({
  id: 'u01', order: 1, title: 'Unit 1', subtitle: 'Sub', pages: [6, 10], lessons: [lesson()], ...over,
})
const withItems = (...items: Item[]) => [unit({ lessons: [lesson({ items })] })]
const errs = (units: Unit[]) => validateContent(units).join('\n')

describe('validateContent', () => {
  it('accepts a minimal valid unit', () => {
    expect(validateContent([unit()])).toEqual([])
  })

  it('flags duplicate item ids across units', () => {
    const u2 = unit({ id: 'u02', order: 2, lessons: [lesson({ id: 'u02-l01', items: [item()] })] })
    expect(errs([unit(), u2])).toContain('duplicate id u01-p06-hej')
  })

  it('checks generated items', () => {
    expect(errs(withItems(item({ kind: 'generated' })))).toContain('generator')
    expect(errs(withItems(item({ generator: { type: 'number', min: 1, max: 9 } })))).toContain('generator')
    expect(errs(withItems(item({ kind: 'generated', generator: { type: 'number', min: 1, max: 9 }, sentences: [{ da: 'a', en: 'b' }] })))).toContain('sentences')
    const gen = (minutes: number[]) => withItems(item({ kind: 'generated', generator: { type: 'time', minutes } }))
    expect(validateContent(gen([0, 5, 55]))).toEqual([])
    expect(validateContent(gen([]))).not.toEqual([])
    expect(validateContent(gen([7]))).not.toEqual([])
    expect(validateContent(gen([60]))).not.toEqual([])
  })

  it('checks recap lessons', () => {
    const recap = (over: Partial<Lesson>): Unit[] => [unit({
      lessons: [lesson(), lesson({
        id: 'u01-l02', pages: [8], items: [], recapOf: ['u01-p06-hej'],
        recapQuestions: [{ prompt_en: 'hi', da: 'hej', accepted: ['hej'] }], ...over,
      })],
    })]
    expect(validateContent(recap({}))).toEqual([])
    expect(errs(recap({ recapOf: ['u01-p99-nope'] }))).toContain('recap')
    expect(errs(recap({ recapQuestions: undefined }))).toContain('recap')
    expect(errs(recap({ items: [item({ id: 'u01-p08-x' })] }))).toContain('recap')
  })

  it('rejects recapOf pointing at a later item', () => {
    const u = unit({
      lessons: [
        lesson({ id: 'u01-l01', items: [], recapOf: ['u01-p08-later'], recapQuestions: [{ prompt_en: 'x', da: 'x', accepted: ['x'] }] }),
        lesson({ id: 'u01-l02', pages: [8], items: [item({ id: 'u01-p08-later' })] }),
      ],
    })
    expect(errs([u])).toContain('recap')
  })

  it('requires items or repeatLines in a non-recap lesson', () => {
    expect(errs([unit({ lessons: [lesson({ items: [] })] })])).toContain('u01-l01')
    expect(validateContent([unit({ lessons: [lesson({ items: [], repeatLines: [{ da: 'a', en: 'b' }] })] })])).toEqual([])
  })

  it('checks noun articles', () => {
    expect(errs(withItems(item({ da: 'bil', gender: 'en' })))).toContain('article')
    expect(errs(withItems(item({ da: 'et bil', gender: 'en' })))).toContain('article')
    expect(validateContent(withItems(item({ da: 'en bil', gender: 'en' })))).toEqual([])
    expect(errs(withItems(item({ da: 'en bil', gender: 'en', alt: { da: ['bil'] } })))).toContain('article')
    expect(validateContent(withItems(item({ da: 'mælk' })))).toEqual([])
  })

  it('checks unit and lesson ids', () => {
    expect(errs([unit({ id: 'unit1' })])).toContain('unit1')
    expect(errs([unit({ lessons: [lesson({ id: 'u02-l01' })] })])).toContain('u02-l01')
  })

  it('checks sentence gaps as whole words', () => {
    const s = (gap: string) => withItems(item({ sentences: [{ da: 'Hun hedder Ellen.', en: 'x', gap }] }))
    expect(errs(s('er'))).toContain('gap')
    expect(validateContent(s('hedder'))).toEqual([])
    expect(validateContent(s('ellen'))).toEqual([])
  })

  it('requires lessons in book-page order', () => {
    const u = unit({ lessons: [lesson({ pages: [10] }), lesson({ id: 'u01-l02', pages: [6], items: [item({ id: 'u01-p06-b' })] })] })
    expect(errs([u])).toContain('order')
  })

  it('requires taughtInClass to be a boolean', () => {
    const bad = (v: unknown) => [unit({ lessons: [lesson({ taughtInClass: v as boolean })] })]
    expect(errs(bad(undefined))).toContain('taughtInClass')
    expect(errs(bad('yes'))).toContain('taughtInClass')
  })
})
