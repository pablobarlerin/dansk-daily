import { describe, expect, it } from 'vitest'
import { checkAnswer, normaliseAnswer } from '../../src/lib/answers'

describe('normaliseAnswer', () => {
  it('strips punctuation, lowercases, straightens quotes', () => {
    expect(normaliseAnswer('Hej, hvordan går det?')).toBe('hej hvordan går det')
    expect(normaliseAnswer('Det’s  OK.')).toBe("det's ok")
    expect(normaliseAnswer('“Ja”')).toBe('ja')
  })
})

describe('checkAnswer', () => {
  it('accepts trivial slips as correct', () => {
    expect(checkAnswer('Jeg hedder Ellen.', ['jeg hedder ellen']).verdict).toBe('correct')
    expect(checkAnswer('jeg  hedder ellen ', ['jeg hedder ellen']).verdict).toBe('correct')
    expect(checkAnswer('Hvad hedder du?', ['hvad hedder du']).verdict).toBe('correct')
    expect(checkAnswer('hej hvordan går det', ['Hej, hvordan går det?']).verdict).toBe('correct')
    expect(checkAnswer('Ja, tak.', ['ja tak']).verdict).toBe('correct')
    expect(checkAnswer('det’s', ["det's"]).verdict).toBe('correct')
  })
  it('folds æ/ø/å to almost', () => {
    for (const a of ['soster', 'soester']) {
      const r = checkAnswer(a, ['søster'])
      expect(r.verdict).toBe('almost')
      expect(r.expected).toBe('søster')
    }
    expect(checkAnswer('gaa', ['gå']).verdict).toBe('almost')
  })
  it('accepts the short fold on its own', () => {
    expect(checkAnswer('blabaer', ['blåbær'])).toMatchObject({ verdict: 'almost', expected: 'blåbær' })
  })
  it('marks wrong answers', () => {
    expect(checkAnswer('bror', ['søster'])).toMatchObject({ verdict: 'wrong', expected: 'søster' })
    expect(checkAnswer('syster', ['søster']).verdict).toBe('wrong')
    expect(checkAnswer('', ['søster']).verdict).toBe('wrong')
    expect(checkAnswer('   ', ['søster']).verdict).toBe('wrong')
  })
  it('returns the matching accepted answer', () => {
    const r = checkAnswer('engelsk', ['engelsk', 'på engelsk'])
    expect(r.verdict).toBe('correct')
    expect(checkAnswer('på engelsk', ['engelsk', 'på engelsk']).expected).toBe('på engelsk')
  })
  it('allows one-letter slips only for sentences', () => {
    const acc = ['Jeg kommer fra Spanien.']
    expect(checkAnswer('jeg kommer fra spanen', acc, { sentence: true })).toMatchObject({
      verdict: 'almost',
      expected: 'Jeg kommer fra Spanien.',
    })
    expect(checkAnswer('jeg kommer fra spunian', acc, { sentence: true }).verdict).toBe('wrong')
    expect(checkAnswer('jeg kommer fra spn', acc, { sentence: true }).verdict).toBe('wrong')
    expect(checkAnswer('bli', ['bil']).verdict).toBe('wrong')
  })
  it('catches article mistakes', () => {
    const g = { gender: 'en' as const }
    expect(checkAnswer('bil', ['en bil'], g)).toMatchObject({ verdict: 'wrong', hint: 'missing-article' })
    expect(checkAnswer('et bil', ['en bil'], g)).toMatchObject({ verdict: 'wrong', hint: 'wrong-article' })
    expect(checkAnswer('En bil.', ['en bil'], g).verdict).toBe('correct')
    expect(checkAnswer('en soster', ['en søster'], g).verdict).toBe('almost')
    expect(checkAnswer('soster', ['en søster'], g)).toMatchObject({ verdict: 'wrong', hint: 'missing-article' })
  })
})
