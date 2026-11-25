import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../../src/app'
import { STORAGE_KEY } from '../../src/lib/store'
import {
  TODAY, fixedNow, fixtureContent, memoryStorage, placedProgress, storageWith, stored,
} from './fixtures'

afterEach(cleanup)

const content = fixtureContent()

function renderApp(storage: Storage) {
  return render(<App content={content} storage={storage} now={fixedNow} />)
}

describe('first launch', () => {
  it('fresh storage shows Welcome', () => {
    renderApp(memoryStorage())
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Learn Danish/)
    expect(screen.getByRole('button', { name: /find my level/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Skip, start from the beginning' })).toBeTruthy()
  })

  it('Skip → Home with unit 1 current, placement done, no states', () => {
    const s = memoryStorage()
    renderApp(s)
    fireEvent.click(screen.getByRole('button', { name: 'Skip, start from the beginning' }))
    expect(screen.getByRole('button', { name: /start today's session/i })).toBeTruthy()
    const current = screen.getByTestId('unit-u01')
    expect(current.getAttribute('aria-current')).toBe('step')
    expect(screen.getByTestId('unit-u02').getAttribute('aria-current')).toBeNull()
    const p = stored(s)
    expect(p.placement).toEqual({ done: true, startUnitId: null })
    expect(p.states).toEqual({})
    expect(p.contentVersion).toBe(content.version)
  })

  it('the main Welcome button leads to the placement test', () => {
    renderApp(memoryStorage())
    fireEvent.click(screen.getByRole('button', { name: /find my level/i }))
    expect(screen.getByRole('progressbar', { name: /placement/i })).toBeTruthy()
    // no uppercase eyebrow: the screen's h1 is the task itself
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toMatch(/placement/i)
  })
})

describe('Home', () => {
  it('shows the 80% mark on each unit bar', () => {
    renderApp(storageWith(placedProgress({ contentVersion: content.version })))
    for (const u of content.units) {
      const card = screen.getByTestId(`unit-${u.id}`)
      expect(within(card).getByTestId('mastery-mark')).toBeTruthy()
      const meter = within(card).getByRole('meter')
      expect(meter.getAttribute('aria-valuetext')).toMatch(/target 80%/)
    }
  })

  it('marks a unit at or above 80% as mastered', () => {
    const strong = { strength: 4, due: TODAY, lapses: 0, seen: 3, known: true }
    const states = Object.fromEntries(
      ['u01-p09-hej', 'u01-p09-farvel', 'u01-p09-bil', 'u01-p10-hus'].map(id => [id, strong]),
    )
    renderApp(storageWith(placedProgress({ contentVersion: content.version, states })))
    const card = screen.getByTestId('unit-u01')
    expect(card.textContent).toMatch(/80% · mastered/)
    expect(screen.getByTestId('unit-u02').textContent).not.toMatch(/mastered/)
  })

  it('shows today\'s minutes floored, and the streak', () => {
    const days = {
      '2026-11-24': { activeSeconds: 900, newIntroduced: 0, reviewsDone: 0 },
      [TODAY]: { activeSeconds: 179.9, newIntroduced: 0, reviewsDone: 0 },
    }
    renderApp(storageWith(placedProgress({ contentVersion: content.version, days })))
    expect(screen.getByText('2 of 15 minutes')).toBeTruthy()
    expect(screen.getByLabelText('Streak: 1 day')).toBeTruthy()
  })

  it('Start today\'s session leads to the daily session; End session goes back Home', () => {
    renderApp(storageWith(placedProgress({ contentVersion: content.version })))
    fireEvent.click(screen.getByRole('button', { name: /start today's session/i }))
    expect(screen.getByTestId('intro-card')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /end session/i }))
    expect(screen.getByRole('button', { name: /start today's session/i })).toBeTruthy()
  })

  it("the caption under the primary button gives today's counts and the next page, dropping zero parts", () => {
    // nothing learned yet: no reviews, so only the new words and the next lesson's page
    renderApp(storageWith(placedProgress({ contentVersion: content.version })))
    const fresh = screen.getByTestId('session-caption')
    expect(fresh.textContent).toBe('7 newNext: p. 9')
    expect(fresh.textContent).not.toMatch(/review/)
    cleanup()

    // lesson 1 done and its three words due: reviews, then the next lesson's new words
    const due = { strength: 2, due: TODAY, lapses: 0, seen: 2, known: true }
    const states = Object.fromEntries(['u01-p09-hej', 'u01-p09-farvel', 'u01-p09-bil'].map(id => [id, due]))
    renderApp(storageWith(placedProgress({ contentVersion: content.version, states, lessonsDone: { 'u01-l01': true } })))
    const spans = screen.getByTestId('session-caption').querySelectorAll('span')
    expect(spans[0].textContent).toBe('3 reviews · 4 new')
    expect(spans[1].textContent).toBe('Next: p. 10')
    cleanup()

    // every lesson done, nothing due: no caption at all
    const later = { strength: 4, due: '2026-12-20', lapses: 0, seen: 4, known: true }
    const all = content.units.flatMap(u => u.lessons)
    renderApp(storageWith(placedProgress({
      contentVersion: content.version,
      states: Object.fromEntries(all.flatMap(l => l.items).map(i => [i.id, later])),
      lessonsDone: Object.fromEntries(all.map(l => [l.id, true])),
    })))
    expect(screen.queryByTestId('session-caption')).toBeNull()
  })

  it("the primary button says Start today's session until something is answered today, then Continue", () => {
    renderApp(storageWith(placedProgress({ contentVersion: content.version, days: { '2026-11-24': { activeSeconds: 900, newIntroduced: 3, reviewsDone: 5 } } })))
    expect(screen.getByRole('button', { name: "Start today's session" })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    cleanup()
    renderApp(storageWith(placedProgress({ contentVersion: content.version, days: { [TODAY]: { activeSeconds: 40, newIntroduced: 1, reviewsDone: 0 } } })))
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: "Start today's session" })).toBeNull()
  })

  it('a unit with words that slipped back says so; a mastered unit says mastered', () => {
    const strong = { strength: 4, due: '2026-12-20', lapses: 0, seen: 4, known: true }
    const slipped = { strength: 1, due: TODAY, lapses: 1, seen: 5, known: true }
    const states = {
      ...Object.fromEntries(['u01-p09-hej', 'u01-p09-farvel', 'u01-p09-bil', 'u01-p10-hus', 'u01-p10-ja'].map(id => [id, strong])),
      'u02-p11-bog': slipped,
      'u02-p11-tavle': slipped,
    }
    renderApp(storageWith(placedProgress({ contentVersion: content.version, states })))
    expect(screen.getByTestId('unit-u01').textContent).toMatch(/100% · mastered/)
    expect(within(screen.getByTestId('unit-u02')).getByTestId('slipped').textContent).toBe("2 words slipped, they'll come back today")
    expect(within(screen.getByTestId('unit-u01')).queryByTestId('slipped')).toBeNull()
  })

  it('monthly backup nudge shows and records lastBackupNudge; dismiss hides it', () => {
    const s = storageWith(placedProgress({ contentVersion: content.version, firstUse: '2026-10-01' }))
    renderApp(s)
    expect(screen.getByText(/save a backup\?/i)).toBeTruthy()
    expect(stored(s).lastBackupNudge).toBe(TODAY)
    fireEvent.click(screen.getByRole('button', { name: /not now/i }))
    expect(screen.queryByText(/save a backup\?/i)).toBeNull()
  })
})

describe('content updates', () => {
  it('changed contentVersion → "New lesson added" toast', () => {
    const s = storageWith(placedProgress({ contentVersion: 'old-version' }))
    renderApp(s)
    expect(screen.getByRole('status').textContent).toMatch(/New lesson added/)
    expect(stored(s).contentVersion).toBe(content.version)
  })

  it('no toast on first use (no stored contentVersion)', () => {
    renderApp(storageWith(placedProgress({ contentVersion: null })))
    expect(screen.queryByText(/New lesson added/)).toBeNull()
  })

  it('no toast when the version is unchanged', () => {
    renderApp(storageWith(placedProgress({ contentVersion: content.version })))
    expect(screen.queryByText(/New lesson added/)).toBeNull()
  })
})

describe('never lose progress', () => {
  it('unreadable stored progress is stashed under a dated backup key before the first save', () => {
    const s = memoryStorage({ [STORAGE_KEY]: '{not json' })
    renderApp(s)
    expect(s.getItem(`dansk-daily:progress-unreadable-${TODAY}`)).toBe('{not json')
    fireEvent.click(screen.getByRole('button', { name: 'Skip, start from the beginning' }))
    expect(stored(s).placement.done).toBe(true)
    expect(s.getItem(`dansk-daily:progress-unreadable-${TODAY}`)).toBe('{not json')
  })

  it('progress from a newer app version is stashed too', () => {
    const newer = JSON.stringify({ schemaVersion: 99, states: { x: {} } })
    const s = memoryStorage({ [STORAGE_KEY]: newer })
    renderApp(s)
    expect(s.getItem(`dansk-daily:progress-unreadable-${TODAY}`)).toBe(newer)
  })

  it("after a successful stash, tells the learner once that the data couldn't be read and a copy was kept", () => {
    const s = memoryStorage({ [STORAGE_KEY]: '{not json' })
    renderApp(s)
    const alert = screen.getByRole('alert').textContent!
    expect(alert).toMatch(/saved progress couldn't be read/i)
    expect(alert).toMatch(/copy .*kept/i)
    expect(alert).toMatch(/import backup/i)
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Skip, start from the beginning' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('readable stored progress shows no notice', () => {
    renderApp(storageWith(placedProgress({ contentVersion: content.version })))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  /** Unreadable stored text, and no room to stash it: saving is blocked. */
  function blockedStorage() {
    const base = memoryStorage({ [STORAGE_KEY]: '{not json' })
    const setItem = base.setItem
    base.setItem = (k: string, v: string) => {
      if (k.startsWith('dansk-daily:progress-unreadable-')) throw new DOMException('Quota', 'QuotaExceededError')
      setItem(k, v)
    }
    return base
  }

  it('while saving is blocked, the warning comes back on every skipped save', () => {
    const s = blockedStorage()
    renderApp(s)
    expect(screen.getByRole('alert').textContent).toMatch(/nothing will be saved/i)
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Skip, start from the beginning' }))
    expect(screen.getByRole('alert').textContent).toMatch(/nothing will be saved/i)
    expect(s.getItem(STORAGE_KEY)).toBe('{not json')
  })

  it('the blocked warning clears once a later safe copy succeeds (Reset)', () => {
    const s = blockedStorage()
    renderApp(s)
    fireEvent.click(screen.getByRole('button', { name: 'Skip, start from the beginning' }))
    expect(screen.getByRole('alert').textContent).toMatch(/nothing will be saved/i)
    fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset all progress' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reset' }))
    expect(s.getItem(`dansk-daily:progress-before-reset-${TODAY}`)).toBe('{not json')
    expect(screen.queryByText(/nothing will be saved/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Skip, start from the beginning' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(stored(s).placement.done).toBe(true)
  })

  it('a failing save shows a readable message instead of crashing', () => {
    renderApp(memoryStorage({}, { failSet: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip, start from the beginning' }))
    expect(screen.getByRole('alert').textContent).toMatch(/couldn't save/i)
    expect(screen.getByRole('button', { name: /start today's session/i })).toBeTruthy()
  })
})

describe('activity timer', () => {
  it('credits active time between taps to today', () => {
    let t = fixedNow().getTime()
    const s = storageWith(placedProgress({ contentVersion: content.version }))
    render(<App content={content} storage={s} now={() => new Date(t)} />)
    fireEvent.pointerDown(document.body)
    t += 30_000
    fireEvent.keyDown(document.body, { key: 'a' })
    expect(stored(s).days[TODAY].activeSeconds).toBe(30)
    expect(screen.getByText('0 of 15 minutes')).toBeTruthy()
  })
})
