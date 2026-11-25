import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app'
import { computeContent } from '../../src/content/load'
import type { Content } from '../../src/content/types'
import { findItem } from '../../src/lib/path'
import type { DayLog, Progress } from '../../src/lib/progressTypes'
import { seeded } from '../../src/lib/rng'
import { review, type ItemState } from '../../src/lib/srs'
import { tapClock } from '../../src/lib/tapGuard'
import { TODAY, fixedNow, fixtureContent, fixtureUnits, placedProgress, storageWith, stored } from './fixtures'

// Each tap is a second apart unless a test says otherwise (intro and repeat ignore double taps).
const realTapClock = tapClock.now
beforeEach(() => {
  let t = 0
  tapClock.now = () => (t += 1000)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  tapClock.now = realTapClock
})

const content = fixtureContent()

const U01 = ['u01-p09-hej', 'u01-p09-farvel', 'u01-p09-bil', 'u01-p10-hus', 'u01-p10-ja']
const U02 = ['u02-p11-bog', 'u02-p11-tavle']
const ALL = [...U01, ...U02]

const later: ItemState = { strength: 4, due: '2026-12-20', lapses: 0, seen: 4, known: true }
const dueToday = (strength = 1): ItemState => ({ strength, due: TODAY, lapses: 0, seen: 2, known: true })

/** Placed progress with audio off (no listening exercises) and the current content version. */
function prog(extra: Partial<Progress> = {}, c: Content = content): Progress {
  const base = placedProgress({ contentVersion: c.version, ...extra })
  return { ...base, settings: { ...base.settings, audio: false, ...(extra.settings ?? {}) } }
}

const statesFor = (ids: string[], s: ItemState) => Object.fromEntries(ids.map(id => [id, s]))
const day = (log: Partial<DayLog>): DayLog => ({ activeSeconds: 0, newIntroduced: 0, reviewsDone: 0, ...log })

function startSession(p: Progress, c: Content = content) {
  const s = storageWith(p)
  render(<App content={c} storage={s} now={fixedNow} />)
  fireEvent.click(screen.getByRole('button', { name: /start today's session/i }))
  return s
}

// ---------- answering whatever exercise is shown ----------

const itemOf = (c: Content, id: string) => findItem(c, id)!.item
const shownIds = () => screen.getByTestId('exercise').getAttribute('data-items')!.split(' ')
const shownKind = () => screen.getByTestId('exercise').getAttribute('data-kind')!

function tapPair(da: string, en: string) {
  fireEvent.click(within(screen.getByTestId('match-da')).getByRole('button', { name: da }))
  fireEvent.click(within(screen.getByTestId('match-en')).getByRole('button', { name: en }))
}

function choose(target: string, right: boolean) {
  const opts = [...screen.getByTestId('exercise').querySelectorAll<HTMLButtonElement>('.choice')]
  const pick = opts.find(b => (b.textContent === target) === right)!
  fireEvent.click(pick)
}

function type(text: string) {
  fireEvent.input(screen.getByRole('textbox', { name: /your answer/i }), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Check' }))
}

/** Answer the shown exercise right or wrong. */
function solve(right: boolean, c: Content = content) {
  const ids = shownIds()
  const item = itemOf(c, ids[0])
  switch (shownKind()) {
    case 'match': {
      const pairs = ids.map(id => itemOf(c, id))
      if (!right) tapPair(pairs[0].da, pairs[1].en)
      for (const p of pairs) tapPair(p.da, p.en)
      return
    }
    case 'mc-da-en': return choose(item.en, right)
    case 'mc-en-da': return choose(item.da, right)
    case 'pick-article': return choose(item.gender!, right)
    case 'gap-options': return choose(item.sentences![0].gap!, right)
    case 'tiles': {
      const bank = screen.getByTestId('tile-bank')
      const words = item.sentences![0].da.replace(/[.,!?]/g, '').split(' ')
      for (const w of right ? words : words.slice(0, 1)) fireEvent.click(within(bank).getAllByRole('button', { name: w })[0])
      fireEvent.click(screen.getByRole('button', { name: 'Check' }))
      return
    }
    case 'type-gap': return type(right ? item.sentences![0].gap! : 'zzz')
    default: return type(right ? item.da : 'zzz')
  }
}

const next = () => fireEvent.click(screen.getByRole('button', { name: /^(continue|got it)$/i }))

/**
 * Answer every remaining exercise of the current phase correctly; returns each exercise's
 * head id (a match's other ids may be pool fillers, so they aren't listed).
 */
function answerAllRight(c: Content = content): string[] {
  const seen: string[] = []
  // recap questions (ids `<lessonId>#q<N>`) are left for the test to answer
  for (let n = 0; n < 50 && screen.queryByTestId('exercise') && !shownIds()[0].includes('#'); n++) {
    seen.push(shownIds()[0])
    solve(true, c)
    next()
  }
  return seen
}

const button = (name: RegExp | string) => screen.getByRole('button', { name })
const queryButton = (name: RegExp | string) => screen.queryByRole('button', { name })

// ---------- tests ----------

describe('daily session', () => {
  it('Start session → the first exercise, and dueTotal is stored as dueAtStart', () => {
    const s = startSession(prog({
      states: { ...statesFor(ALL, later), 'u01-p09-hej': dueToday(), 'u01-p09-farvel': dueToday() },
      lessonsDone: { 'u02-l02': true },
    }))
    expect(screen.getByTestId('exercise')).toBeTruthy()
    expect(['u01-p09-hej', 'u01-p09-farvel']).toContain(shownIds()[0])
    expect(stored(s).days[TODAY].dueAtStart).toBe(2)
  })

  it('a day that already has dueAtStart keeps it', () => {
    const s = startSession(prog({
      states: { ...statesFor(ALL, later), 'u01-p09-hej': dueToday() },
      lessonsDone: { 'u02-l02': true },
      days: { [TODAY]: day({ dueAtStart: 9 }) },
    }))
    expect(shownIds()[0]).toBe('u01-p09-hej')
    expect(stored(s).days[TODAY].dueAtStart).toBe(9)
  })

  it('intro card: Next stores a new state, "I know this" sets strength 3; each adds to newIntroduced', () => {
    const s = startSession(prog())
    expect(screen.getByTestId('intro-card').textContent).toContain('hej')
    fireEvent.click(button('Next'))
    let p = stored(s)
    expect(p.days[TODAY].newIntroduced).toBe(1)
    expect(p.states['u01-p09-hej']).toMatchObject({ strength: 0, due: TODAY, known: false })

    expect(screen.getByTestId('intro-card').textContent).toContain('farvel')
    fireEvent.click(button(/i know this/i))
    p = stored(s)
    expect(p.days[TODAY].newIntroduced).toBe(2)
    expect(p.states['u01-p09-farvel']).toMatchObject({ strength: 3, known: true })
  })

  it('a double tap on intro "Next" introduces one card, not two', () => {
    let t = 10_000
    tapClock.now = () => t
    const s = startSession(prog())
    fireEvent.click(button('Next')) // hej
    t += 120
    fireEvent.click(button('Next')) // the second tap of a double tap lands on farvel's card
    expect(screen.getByTestId('intro-card').textContent).toContain('farvel')
    let p = stored(s)
    expect(p.days[TODAY].newIntroduced).toBe(1)
    expect(p.states['u01-p09-farvel']).toBeUndefined()
    t += 1000
    fireEvent.click(button('Next'))
    p = stored(s)
    expect(p.days[TODAY].newIntroduced).toBe(2)
    expect(p.states['u01-p09-farvel']).toBeDefined()
  })

  it('a double tap on "I know this" marks one card only', () => {
    let t = 10_000
    tapClock.now = () => t
    const s = startSession(prog())
    fireEvent.click(button(/i know this/i)) // hej
    t += 120
    fireEvent.click(button(/i know this/i))
    expect(screen.getByTestId('intro-card').textContent).toContain('farvel')
    expect(stored(s).days[TODAY].newIntroduced).toBe(1)
    expect(stored(s).states['u01-p09-farvel']).toBeUndefined()
  })

  it('a double tap on the last intro card never skips the repeat line after it', () => {
    let t = 10_000
    tapClock.now = () => t
    startSession(prog({ settings: { audio: false, speed: 1, newPerDay: 3, backupNudge: true } }))
    fireEvent.click(button('Next')) // hej
    t += 1000
    fireEvent.click(button('Next')) // farvel
    t += 1000
    fireEvent.click(button('Next')) // bil, the last card
    t += 120
    fireEvent.click(button('Next')) // lands on the repeat line's Next
    expect(screen.getByTestId('repeat-line').textContent).toContain('Hvad hedder du?')
  })

  it('after the intro cards: the lesson\'s repeat lines, then a first test of only the ids introduced with Next', () => {
    const s = startSession(prog({ settings: { audio: false, speed: 1, newPerDay: 3, backupNudge: true } }))
    fireEvent.click(button('Next')) // hej
    fireEvent.click(button(/i know this/i)) // farvel
    fireEvent.click(button('Next')) // bil
    // the lesson's repeat line, not yet seen
    expect(screen.getByTestId('repeat-line').textContent).toContain('Hvad hedder du?')
    expect(stored(s).repeatsSeen['u01-l01#r0']).toBe(TODAY)
    fireEvent.click(button('Next'))
    const heads = answerAllRight()
    expect(heads.length).toBeGreaterThan(0)
    for (const id of heads) expect(['u01-p09-hej', 'u01-p09-bil']).toContain(id)
    // their first test schedules them; the "I know this" item is untouched
    const p = stored(s)
    expect(p.states['u01-p09-hej'].strength).toBe(1)
    expect(p.states['u01-p09-bil'].strength).toBe(1)
    expect(p.states['u01-p09-farvel']).toMatchObject({ strength: 3, seen: 0 })
  })

  it('a review adds 1 to reviewsDone on its first graded answer only (re-asks don\'t count)', () => {
    const s = startSession(prog({
      states: { ...statesFor(ALL, later), 'u01-p09-hej': dueToday() },
      lessonsDone: { 'u02-l02': true },
    }))
    expect(shownIds()[0]).toBe('u01-p09-hej')
    solve(false)
    expect(stored(s).days[TODAY].reviewsDone).toBe(1)
    next()
    // re-asked
    expect(shownIds()[0]).toBe('u01-p09-hej')
    solve(true)
    next()
    expect(stored(s).days[TODAY].reviewsDone).toBe(1)
  })

  it('after the exercises the Repeat round appears; Skip → Keep going with Another lesson and Practise weak items; Finish → Summary', () => {
    const s = startSession(prog({
      states: { ...statesFor(U01, later), 'u01-p09-hej': dueToday() },
      settings: { audio: false, speed: 1, newPerDay: 3, backupNudge: true },
    }))
    answerAllRight() // the one review
    // new material: u02-l01 (no repeat lines): both known → no first test
    fireEvent.click(button(/i know this/i))
    fireEvent.click(button(/i know this/i))
    // repeat round: u01-l01 is started and has a line
    expect(screen.getByRole('heading', { name: /repeat after me/i })).toBeTruthy()
    expect(screen.getByTestId('repeat-line').textContent).toContain('Hvad hedder du?')
    fireEvent.click(button('Skip'))

    expect(screen.getByRole('heading', { name: /keep going/i })).toBeTruthy()
    expect(screen.getByText(/minutes? to go|more minutes?/i)).toBeTruthy()
    expect(button('Another lesson')).toBeTruthy()
    expect(button('Practise weak items')).toBeTruthy()

    fireEvent.click(button('Finish'))
    const summary = screen.getByTestId('summary')
    expect(within(summary).getByTestId('stat-reviewed').textContent).toMatch(/^1/)
    expect(within(summary).getByTestId('stat-learned').textContent).toMatch(/^2/)
    expect(within(summary).getByTestId('stat-accuracy').textContent).toMatch(/^100%/)
    expect(within(summary).getByTestId('stat-streak').textContent).toMatch(/^0/)
    expect(stored(s).days[TODAY].reviewsDone).toBe(1)
    fireEvent.click(button('Done'))
    expect(button(/start today's session/i)).toBeTruthy()
  })

  it('Summary shows "—" accuracy when nothing was graded', () => {
    startSession(prog({ states: statesFor(ALL, later), lessonsDone: { 'u02-l02': true } }))
    // nothing due, no new lesson: repeat round
    fireEvent.click(button('Skip'))
    expect(queryButton('Another lesson')).toBeNull()
    fireEvent.click(button('Finish'))
    expect(screen.getByTestId('stat-accuracy').textContent).toMatch(/^—/)
  })

  it('Practise weak items runs an off-schedule practice and comes back to Keep going (no repeat round)', () => {
    const s = startSession(prog({ states: statesFor(ALL, later), lessonsDone: { 'u02-l02': true } }))
    fireEvent.click(button('Skip'))
    const before = stored(s).states
    fireEvent.click(button('Practise weak items'))
    const seen = answerAllRight()
    expect(seen.length).toBeGreaterThan(0)
    // correct off-schedule answers don't change states
    expect(stored(s).states).toEqual(before)
    expect(screen.getByRole('heading', { name: /keep going/i })).toBeTruthy()
  })

  it('a recap day practises recapIds off-schedule, then runs its questions once, then marks the lesson done', () => {
    const units = structuredClone(fixtureUnits)
    const recap = units[1].lessons[1]
    recap.context = ['Anna is in class with a book.']
    recap.recapQuestions = [
      { prompt_en: 'How do you say "It is a book"?', da: 'Det er en bog.', accepted: ['Det er en bog.', 'Det er en bog'] },
      { prompt_en: 'How do you say "It is a board"?', da: 'Det er en tavle.', accepted: ['Det er en tavle.'] },
    ]
    const c = computeContent(units)
    const s = startSession(prog({ states: statesFor(ALL, later) }, c), c)

    // step 1: recapIds off-schedule
    const recapSeen = answerAllRight(c)
    expect(recapSeen.length).toBeGreaterThan(0)
    for (const id of recapSeen) expect(['u01-p09-hej', 'u02-p11-bog']).toContain(id)
    expect(stored(s).states).toEqual(statesFor(ALL, later)) // correct = no change

    // step 2: the questions, with context
    expect(screen.getByText('Anna is in class with a book.')).toBeTruthy()
    expect(screen.getByTestId('prompt').textContent).toContain('It is a book')
    type('det er en bog')
    expect(screen.getByRole('region', { name: /feedback/i }).textContent).toMatch(/correct/i)
    expect(stored(s).lessonsDone['u02-l02']).toBeUndefined()
    next()
    expect(screen.getByTestId('prompt').textContent).toContain('It is a board')
    type('zzz')
    next()
    expect(stored(s).lessonsDone['u02-l02']).toBe(true)
    // recap ids never come back later in the session
    expect(screen.queryByTestId('exercise')).toBeNull()
  })

  it('a recap question that was reported is skipped', () => {
    const units = structuredClone(fixtureUnits)
    units[1].lessons[1].recapQuestions = [
      { prompt_en: 'Q zero', da: 'Det er en bog.', accepted: ['Det er en bog.'] },
      { prompt_en: 'Q one', da: 'Det er en tavle.', accepted: ['Det er en tavle.'] },
    ]
    const c = computeContent(units)
    const report = { itemId: 'u02-l02#q0', unitId: 'u02', da: 'x', en: 'y', note: 'n', day: TODAY, itemHash: c.hashes['u02-l02#q0'] }
    startSession(prog({ states: statesFor(ALL, later), reports: [report] }, c), c)
    answerAllRight(c) // recap ids, then the first question shown
    expect(screen.getByTestId('prompt').textContent).toBe('Q one')
    expect(screen.queryByText('Q zero')).toBeNull()
  })

  it('on an overloaded day "Another lesson" is hidden', () => {
    startSession(prog({
      states: statesFor(U01, later),
      days: { [TODAY]: day({ dueAtStart: 61, newIntroduced: 3 }) },
    }))
    expect(screen.getByRole('heading', { name: /repeat after me/i })).toBeTruthy()
    fireEvent.click(button('Skip'))
    expect(screen.getByRole('heading', { name: /keep going/i })).toBeTruthy()
    expect(queryButton('Another lesson')).toBeNull()
    expect(button('Practise weak items')).toBeTruthy()
  })

  it('Another lesson runs the next lesson as new material, then back to Keep going', () => {
    const s = startSession(prog({
      states: statesFor(U01, later),
      days: { [TODAY]: day({ newIntroduced: 10 }) },
    }))
    fireEvent.click(button('Skip'))
    fireEvent.click(button('Another lesson'))
    expect(screen.getByTestId('intro-card').textContent).toContain('bog')
    fireEvent.click(button(/i know this/i))
    fireEvent.click(button(/i know this/i))
    expect(stored(s).days[TODAY].newIntroduced).toBe(12)
    expect(screen.getByRole('heading', { name: /keep going/i })).toBeTruthy()
  })

  it('report on a wrong MATCH undoes every id it graded (right pairs too), keeps the exercise shown, leaves reviewsDone, and they don\'t come back', () => {
    const due = dueToday(1)
    const initial = prog({ states: statesFor(ALL, due), lessonsDone: { 'u02-l02': true } })
    let s: ReturnType<typeof storageWith> | null = null
    for (let seed = 1; seed < 400; seed++) {
      vi.spyOn(Math, 'random').mockImplementation(seeded(seed))
      s = startSession(initial)
      if (shownKind() === 'match') break
      cleanup()
      vi.restoreAllMocks()
      s = null
    }
    expect(s).not.toBeNull()
    const ids = shownIds()
    expect(ids.length).toBeGreaterThanOrEqual(4)

    solve(false) // misses the first two pairs only
    let p = stored(s!)
    expect(p.days[TODAY].reviewsDone).toBe(ids.length)
    // graded per pair: the two missed pairs wrong, the pairs matched right correct
    ids.forEach((id, k) => expect(p.states[id]).toEqual(review(due, k < 2 ? 'wrong' : 'correct', TODAY)))

    fireEvent.click(button(/report a problem/i))
    const dialog = screen.getByRole('dialog', { name: /report/i })
    fireEvent.click(within(dialog).getByRole('radio', { name: 'wrong translation' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }))

    p = stored(s!)
    expect(p.reports).toHaveLength(1)
    expect(ids).toContain(p.reports[0].itemId)
    for (const id of ids) expect(p.states[id]).toEqual(due)
    expect(p.days[TODAY].reviewsDone).toBe(ids.length)
    // the same exercise stays under the sheet
    expect(shownIds()).toEqual(ids)

    next()
    const rest = answerAllRight()
    for (const id of ids) expect(rest).not.toContain(id)
    expect(rest.length).toBeGreaterThan(0)
  })
})
