import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app'
import { computeContent } from '../../src/content/load'
import type { Content } from '../../src/content/types'
import { findItem } from '../../src/lib/path'
import type { DayLog, Progress } from '../../src/lib/progressTypes'
import type { ItemState } from '../../src/lib/srs'
import { TODAY, fixedNow, fixtureContent, fixtureUnits, placedProgress, storageWith, stored } from './fixtures'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const content = fixtureContent()

const U01 = ['u01-p09-hej', 'u01-p09-farvel', 'u01-p09-bil', 'u01-p10-hus', 'u01-p10-ja']
const later: ItemState = { strength: 4, due: '2026-12-20', lapses: 0, seen: 4, known: true }
const statesFor = (ids: string[], s: ItemState) => Object.fromEntries(ids.map(id => [id, s]))
const day = (log: Partial<DayLog>): DayLog => ({ activeSeconds: 0, newIntroduced: 0, reviewsDone: 0, ...log })

function prog(extra: Partial<Progress> = {}, c: Content = content): Progress {
  const base = placedProgress({ contentVersion: c.version, ...extra })
  return { ...base, settings: { ...base.settings, audio: false, ...(extra.settings ?? {}) } }
}

const button = (name: RegExp | string) => screen.getByRole('button', { name })
const queryButton = (name: RegExp | string) => screen.queryByRole('button', { name })

function openUnit(p: Progress, title: string, c: Content = content) {
  const s = storageWith(p)
  render(<App content={c} storage={s} now={fixedNow} />)
  fireEvent.click(button(title))
  return s
}

const shownIds = () => screen.getByTestId('exercise').getAttribute('data-items')!.split(' ')
const shownKind = () => screen.getByTestId('exercise').getAttribute('data-kind')!
const itemOf = (id: string) => findItem(content, id)!.item

function type(text: string) {
  fireEvent.input(screen.getByRole('textbox', { name: /your answer/i }), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Check' }))
}

function choose(target: string, right: boolean) {
  const opts = [...screen.getByTestId('exercise').querySelectorAll<HTMLButtonElement>('.choice')]
  fireEvent.click(opts.find(b => (b.textContent === target) === right)!)
}

function tapPair(da: string, en: string) {
  fireEvent.click(within(screen.getByTestId('match-da')).getByRole('button', { name: da }))
  fireEvent.click(within(screen.getByTestId('match-en')).getByRole('button', { name: en }))
}

/** Answer the shown exercise right or wrong. */
function solve(right: boolean) {
  const ids = shownIds()
  const item = itemOf(ids[0])
  switch (shownKind()) {
    case 'match':
      for (const id of ids) tapPair(itemOf(id).da, itemOf(id).en)
      return
    case 'mc-da-en': return choose(item.en, right)
    case 'mc-en-da': return choose(item.da, right)
    case 'pick-article': return choose(item.gender!, right)
    case 'gap-options': return choose(item.sentences![0].gap!, right)
    case 'tiles': {
      const bank = screen.getByTestId('tile-bank')
      const words = item.sentences![0].da.replace(/[.,!?]/g, '').split(' ')
      for (const w of words) fireEvent.click(within(bank).getAllByRole('button', { name: w })[0])
      fireEvent.click(screen.getByRole('button', { name: 'Check' }))
      return
    }
    case 'type-gap': return type(right ? item.sentences![0].gap! : 'zzz')
    default: return type(right ? item.da : 'zzz')
  }
}

const next = () => fireEvent.click(screen.getByRole('button', { name: /^(continue|got it)$/i }))

/** Answer every exercise shown (right), collecting each exercise's kind and head id. */
function answerAll(right = true): { kind: string; id: string }[] {
  const seen: { kind: string; id: string }[] = []
  for (let n = 0; n < 60 && screen.queryByTestId('exercise'); n++) {
    seen.push({ kind: shownKind(), id: shownIds()[0] })
    solve(right)
    next()
  }
  return seen
}

describe('unit detail', () => {
  it('tapping a unit on Home opens it; Back returns Home', () => {
    openUnit(prog(), 'I klassen 1')
    expect(screen.getByRole('heading', { name: 'I klassen 1' })).toBeTruthy()
    expect(screen.getByText('Klassen')).toBeTruthy()
    expect(screen.getByRole('meter', { name: /mastery/i })).toBeTruthy()
    fireEvent.click(button(/back to units/i))
    expect(button(/start today's session/i)).toBeTruthy()
  })

  it('"Start this lesson" on unit 2 (not current) shows its first intro card even when today\'s limit is used up', () => {
    const s = openUnit(prog({ days: { [TODAY]: day({ newIntroduced: 10 }) } }), 'I klassen 1')
    fireEvent.click(button(/start this lesson: klassen/i))
    expect(screen.getByTestId('intro-card').textContent).toContain('bog')
    fireEvent.click(button('Next'))
    expect(stored(s).days[TODAY].newIntroduced).toBe(11)
    expect(stored(s).states['u02-p11-bog']).toMatchObject({ strength: 0, known: false })
    expect(screen.getByTestId('intro-card').textContent).toContain('tavle')
    fireEvent.click(button(/i know this/i))
    expect(stored(s).days[TODAY].newIntroduced).toBe(12)
    // first test of the item introduced with Next
    const heads = answerAll()
    expect(heads.map(h => h.id)).toContain('u02-p11-bog')
    for (const h of heads) expect(h.id).toBe('u02-p11-bog')
    expect(stored(s).states['u02-p11-bog'].strength).toBe(1)
    // ends at Summary; Done → back to the unit
    const summary = screen.getByTestId('summary')
    expect(within(summary).getByTestId('stat-learned').textContent).toMatch(/^2/)
    fireEvent.click(button('Done'))
    expect(screen.getByRole('heading', { name: 'I klassen 1' })).toBeTruthy()
  })

  it('a lesson with some learned items: new items first, then the learned ones off-schedule', () => {
    const s = openUnit(prog({ states: { 'u01-p09-hej': later } }), 'Præsentation 1')
    fireEvent.click(button(/start this lesson: hej/i))
    expect(screen.getByTestId('intro-card').textContent).toContain('farvel')
    fireEvent.click(button(/i know this/i))
    fireEvent.click(button(/i know this/i)) // bil
    // the lesson's repeat line (first time)
    expect(screen.getByTestId('repeat-line').textContent).toContain('Hvad hedder du?')
    fireEvent.click(button('Next'))
    const heads = answerAll()
    expect(heads.map(h => h.id)).toEqual(['u01-p09-hej'])
    expect(stored(s).states['u01-p09-hej']).toEqual(later) // correct off-schedule = no change
    expect(screen.getByTestId('summary')).toBeTruthy()
  })

  it('a learned lesson shows "Practise this lesson" and practises off-schedule (wrong = reviewed as wrong)', () => {
    const s = openUnit(prog({ states: statesFor(U01, later) }), 'Præsentation 1')
    expect(queryButton(/start this lesson: hej/i)).toBeNull()
    fireEvent.click(button(/practise this lesson: hej/i))
    expect(['u01-p09-hej', 'u01-p09-farvel', 'u01-p09-bil']).toContain(shownIds()[0])
    const first = shownIds()[0]
    solve(false)
    expect(stored(s).states[first].lapses).toBe(1)
    next()
    answerAll()
    expect(stored(s).states['u01-p10-hus']).toEqual(later)
    expect(screen.getByTestId('summary')).toBeTruthy()
  })

  it('a lesson with nothing at all (all reported) has no start button', () => {
    const reports = ['u01-p10-hus', 'u01-p10-ja'].map(id => ({
      itemId: id, unitId: 'u01', da: 'x', en: 'y', note: 'n', day: TODAY, itemHash: content.hashes[id],
    }))
    openUnit(prog({ reports }), 'Præsentation 1')
    expect(queryButton(/this lesson: navne/i)).toBeNull()
    expect(button(/start this lesson: hej/i)).toBeTruthy()
  })

  it('a recap lesson: Practise → its recap ids, then its questions, then lessonsDone', () => {
    const units = structuredClone(fixtureUnits)
    units[1].lessons[1].recapQuestions = [{ prompt_en: 'Say "It is a book"', da: 'Det er en bog.', accepted: ['Det er en bog.'] }]
    const c = computeContent(units)
    const s = openUnit(prog({ states: statesFor([...U01, 'u02-p11-bog'], later) }, c), 'I klassen 1', c)
    fireEvent.click(button(/practise this lesson: repetition/i))
    for (let n = 0; n < 20 && !screen.getByTestId('exercise').getAttribute('data-items')!.includes('#'); n++) {
      solve(true)
      next()
    }
    expect(screen.getByTestId('prompt').textContent).toContain('It is a book')
    type('Det er en bog.')
    next()
    expect(stored(s).lessonsDone['u02-l02']).toBe(true)
    expect(screen.getByTestId('summary')).toBeTruthy()
  })

  it('each lesson\'s repeat lines open on demand and viewing them does not mark them seen', () => {
    const s = openUnit(prog(), 'Præsentation 1')
    expect(screen.queryByText('Hvad hedder du?')).toBeNull()
    const toggle = button(/repeat lines: hej/i)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Hvad hedder du?')).toBeTruthy()
    expect(screen.getByText("What's your name?")).toBeTruthy()
    expect(stored(s).repeatsSeen).toEqual({})
    // Navne has no lines → no toggle
    expect(queryButton(/repeat lines: navne/i)).toBeNull()
  })
})

describe('checkpoint', () => {
  it('is disabled for a unit with no started items', () => {
    openUnit(prog(), 'I klassen 1')
    expect((button(/checkpoint/i) as HTMLButtonElement).disabled).toBe(true)
  })

  it('asks only produce exercises of the unit\'s started items and shows a score; Back to unit', () => {
    const started = ['u01-p09-hej', 'u01-p09-bil', 'u01-p10-hus']
    const s = openUnit(prog({ states: statesFor(started, later) }), 'Præsentation 1')
    const cp = button(/checkpoint/i) as HTMLButtonElement
    expect(cp.disabled).toBe(false)
    fireEvent.click(cp)
    // first one wrong (counts against the score), then everything right
    const firstId = shownIds()[0]
    expect(['type-da', 'listen-type', 'type-gap']).toContain(shownKind())
    solve(false)
    expect(stored(s).states[firstId].lapses).toBe(1)
    next()
    const seen = answerAll()
    for (const x of seen) expect(['type-da', 'listen-type', 'type-gap']).toContain(x.kind)
    const asked = new Set([firstId, ...seen.map(x => x.id)])
    expect([...asked].sort()).toEqual([...started].sort())
    expect(screen.getByTestId('checkpoint-score').textContent).toMatch(/2\s*\/\s*3/)
    // correct off-schedule answers left the others unchanged
    for (const id of started.filter(i => i !== firstId)) expect(stored(s).states[id]).toEqual(later)
    fireEvent.click(button(/back to unit/i))
    expect(screen.getByRole('heading', { name: 'Præsentation 1' })).toBeTruthy()
  })

  it('asks at most 10 items', () => {
    const units = structuredClone(fixtureUnits)
    for (let n = 0; n < 12; n++) {
      units[0].lessons[1].items.push({ id: `u01-p10-w${n}`, kind: 'word', da: `ord${n}`, en: `word ${n}` })
    }
    const c = computeContent(units)
    const ids = units[0].lessons.flatMap(l => l.items.map(i => i.id))
    openUnit(prog({ states: statesFor(ids, later) }, c), 'Præsentation 1', c)
    fireEvent.click(button(/checkpoint/i))
    const asked = new Set<string>()
    for (let n = 0; n < 40 && screen.queryByTestId('exercise'); n++) {
      const id = shownIds()[0]
      asked.add(id)
      const item = findItem(c, id)!.item
      type(shownKind() === 'type-gap' ? item.sentences![0].gap! : item.da)
      next()
    }
    expect(asked.size).toBe(10)
    expect(screen.getByTestId('checkpoint-score').textContent).toMatch(/10\s*\/\s*10/)
  })
})
