import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../../src/app'
import { findItem } from '../../src/lib/path'
import type { Progress } from '../../src/lib/progressTypes'
import { emptyProgress } from '../../src/lib/store'
import { TODAY, fixedNow, fixtureContent, memoryStorage, storageWith, stored } from './fixtures'

afterEach(cleanup)

const content = fixtureContent()

function renderApp(storage: Storage) {
  return render(<App content={content} storage={storage} now={fixedNow} />)
}

const flat = (q: Record<string, string[]>) => Object.values(q).flat()

function startPlacement(storage: Storage) {
  renderApp(storage)
  fireEvent.click(screen.getByRole('button', { name: /find my level/i }))
}

function currentId(): string {
  return screen.getByTestId('exercise').getAttribute('data-items')!
}

function rightAnswer(id: string): string {
  const kind = screen.getByTestId('exercise').getAttribute('data-kind')
  const { item } = findItem(content, id)!
  if (kind === 'type-gap') return item.sentences![0].gap!
  return item.da
}

function answer(text: string) {
  fireEvent.input(screen.getByRole('textbox', { name: /your answer/i }), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Check' }))
}

function next() {
  fireEvent.click(screen.getByRole('button', { name: /continue|got it/i }))
}

/** Answer the shown question: right when `right(id)`, else wrong. Returns the id. */
function answerOne(right: (id: string) => boolean): string {
  const id = currentId()
  answer(right(id) ? rightAnswer(id) : 'zzz')
  next()
  return id
}

describe('Placement', () => {
  it('starting stores the questions with empty answers and asks produce exercises', () => {
    const s = memoryStorage()
    startPlacement(s)
    const ip = stored(s).placement.inProgress!
    expect(Object.keys(ip.questions)).toEqual(['u01', 'u02'])
    expect(flat(ip.questions)).toHaveLength(7)
    expect(ip.answers).toEqual({})
    expect(['type-da', 'type-gap', 'listen-type']).toContain(screen.getByTestId('exercise').getAttribute('data-kind'))
    expect(flat(ip.questions)[0]).toBe(currentId())
  })

  it('resumes with the same remaining questions after a reload', () => {
    const s = memoryStorage()
    startPlacement(s)
    const asked = [answerOne(() => true), answerOne(() => false)]
    const before = stored(s).placement.inProgress!
    expect(Object.keys(before.answers)).toEqual(asked)
    cleanup()

    renderApp(s)
    const after = stored(s).placement.inProgress!
    expect(after.questions).toEqual(before.questions)
    const remaining = flat(before.questions).filter(id => !asked.includes(id))
    expect(currentId()).toBe(remaining[0])
    const order: string[] = []
    while (screen.queryByTestId('exercise')) order.push(answerOne(() => true))
    expect(order).toEqual(remaining)
  })

  it('finishing sets placement.done and the start unit, and deletes inProgress', () => {
    const s = memoryStorage()
    startPlacement(s)
    while (screen.queryByTestId('exercise')) answerOne(id => id.startsWith('u01'))
    const p = stored(s)
    expect(p.placement).toEqual({ done: true, startUnitId: 'u02' })
    expect(p.states['u01-p09-hej'].strength).toBe(3)
    expect(p.states['u02-p11-bog']).toBeUndefined()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/your level/i)
    fireEvent.click(screen.getByRole('button', { name: /start learning/i }))
    expect(screen.getByRole('button', { name: /start today's session/i })).toBeTruthy()
  })

  it("\"Don't know\" records the question as not known", () => {
    const s = memoryStorage()
    startPlacement(s)
    const id = currentId()
    fireEvent.click(screen.getByRole('button', { name: /don't know/i }))
    expect(stored(s).placement.inProgress!.answers).toEqual({ [id]: false })
    expect(screen.getByRole('region', { name: /feedback/i }).textContent).toMatch(/Correct answer/)
  })

  it('a wrong answer shows the right answer', () => {
    const s = memoryStorage()
    startPlacement(s)
    const id = currentId()
    const expected = rightAnswer(id)
    answer('zzz')
    expect(screen.getByRole('region', { name: /feedback/i }).textContent).toContain(`Correct answer: ${expected}`)
  })

  it('⚑ Report removes the question from inProgress, and the item is not placed', () => {
    const s = memoryStorage()
    startPlacement(s)
    const reported = currentId()
    expect(reported.startsWith('u01')).toBe(true)
    answer(rightAnswer(reported))
    expect(stored(s).placement.inProgress!.answers[reported]).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /report a problem/i }))
    const dialog = screen.getByRole('dialog', { name: /report/i })
    fireEvent.click(within(dialog).getByRole('radio', { name: 'wrong en/et' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }))
    const ip = stored(s).placement.inProgress!
    expect(flat(ip.questions)).not.toContain(reported)
    expect(ip.answers).not.toHaveProperty(reported)
    expect(stored(s).reports[0]).toMatchObject({ itemId: reported, note: 'wrong en/et', itemHash: content.hashes[reported] })
    next()

    // everything else in u01 right (unit passes, so taught items would be raised to 2), u02 wrong
    while (screen.queryByTestId('exercise')) answerOne(id => id.startsWith('u01'))
    const p = stored(s)
    expect(p.placement.done).toBe(true)
    expect(p.states).not.toHaveProperty(reported)
  })

  it('an unfinished placement opens straight into the test on launch', () => {
    const p: Progress = {
      ...emptyProgress(TODAY),
      contentVersion: content.version,
      placement: {
        done: false, startUnitId: null,
        inProgress: { questions: { u01: ['u01-p10-ja', 'u01-p09-hej'], u02: ['u02-p11-bog'] }, answers: { 'u01-p10-ja': true } },
      },
    }
    renderApp(storageWith(p))
    expect(currentId()).toBe('u01-p09-hej')
  })

  it('reported ids saved before finishing are left out of scoring', () => {
    // hej was reported in an earlier session but its question and answer are still stored
    const p: Progress = {
      ...emptyProgress(TODAY),
      contentVersion: content.version,
      reports: [{ itemId: 'u01-p09-hej', unitId: 'u01', da: 'hej', en: 'hello', note: 'x', day: TODAY, itemHash: content.hashes['u01-p09-hej'] }],
      placement: {
        done: false, startUnitId: null,
        inProgress: { questions: { u01: ['u01-p09-hej', 'u01-p10-ja'], u02: ['u02-p11-bog'] }, answers: { 'u01-p09-hej': false } },
      },
    }
    const s = storageWith(p)
    renderApp(s)
    while (screen.queryByTestId('exercise')) answerOne(() => true)
    const out = stored(s)
    // without hej, u01 is 1/1 and u02 is 1/1: every unit passes
    expect(out.placement).toEqual({ done: true, startUnitId: null })
    expect(out.states).not.toHaveProperty('u01-p09-hej')
  })
})
