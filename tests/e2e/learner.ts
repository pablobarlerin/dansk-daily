/**
 * The simulated learner: reads the shown exercise from the screen and answers it.
 *
 * Answers come from the real unit files, never from the app: the exercise's `data-items`
 * (item ids, or a recap question id `<lessonId>#q<N>`) and `data-kind` say what is asked, the
 * shown prompt picks the sentence (gap, tiles) or the drawn number/time (generated items), and
 * the item's fields give the answer. The feedback sheet then confirms the intended verdict, so a
 * wrong derivation (or a grading bug) fails the test at once.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { expect, type BrowserContext, type Page } from '@playwright/test'
import type { Item, Lesson, Unit } from '../../src/content/types'
import { normaliseAnswer } from '../../src/lib/answers'
import { numberToDanish } from '../../src/lib/danishNumbers'
import { timeToDanish } from '../../src/lib/danishTime'
import type { Rng } from '../../src/lib/rng'

// ---------- content ----------

const UNITS_DIR = new URL('../../src/content/units/', import.meta.url)
export const units: Unit[] = readdirSync(UNITS_DIR)
  .filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(readFileSync(new URL(f, UNITS_DIR), 'utf8')) as Unit)
  .sort((a, b) => a.order - b.order)
export const items = new Map<string, Item>()
export const lessons = new Map<string, Lesson>()
for (const u of units)
  for (const l of u.lessons) {
    lessons.set(l.id, l)
    for (const i of l.items) items.set(i.id, i)
  }
export const isSpecial = (l: Lesson) => l.recapOf !== undefined || l.items.length === 0

const wordsOf = (s: string) => s.split(/\s+/).map(w => w.replace(/[.,!?;:]/g, '')).filter(w => w !== '')
const same = (a: string, b: string) => normaliseAnswer(a) === normaliseAnswer(b)

/** A generated item's Danish for the digits shown ("17", "7:30"). */
function generatedDanish(item: Item, digits: string): string {
  const g = item.generator!
  if (g.type === 'number') return numberToDanish(Number(digits)).primary
  const [h, m] = digits.split(':').map(Number)
  return timeToDanish(h, m).primary
}

const quoted = (title: string) => {
  const m = /"(.+)"/.exec(title)
  if (!m) throw new Error(`No quoted value in "${title}"`)
  return m[1]
}

function sentenceFor(item: Item, bubble: string) {
  const en = bubble.split('\n').pop()!.trim()
  const s = (item.sentences ?? []).find(x => x.en === en)
  if (!s) throw new Error(`No sentence "${en}" for ${item.id}`)
  return s
}

type Solution =
  | { t: 'choice'; answer: string }
  | { t: 'typed'; answer: string }
  | { t: 'tiles'; words: string[] }
  | { t: 'match'; pairs: { da: string; en: string }[] }

export interface Shown {
  kind: string
  ids: string[]
  title: string
  bubble: string | null
  kicker: string
}

/** The right answer for what is on screen, from the unit files. */
export function solve(ex: Shown): Solution {
  const [id] = ex.ids
  if (id.includes('#q')) {
    const [lessonId, n] = id.split('#q')
    const q = lessons.get(lessonId)!.recapQuestions![Number(n)]
    return { t: 'typed', answer: q.da }
  }
  const item = items.get(id)
  if (!item) throw new Error(`Unknown item ${id}`)
  const gen = item.kind === 'generated'
  switch (ex.kind) {
    case 'mc-da-en':
      return { t: 'choice', answer: item.en }
    case 'mc-en-da':
      return { t: 'choice', answer: gen ? generatedDanish(item, quoted(ex.title)) : item.da }
    case 'pick-article':
      return { t: 'choice', answer: item.gender! }
    case 'gap-options':
      return { t: 'choice', answer: sentenceFor(item, ex.bubble!).gap! }
    case 'type-gap':
      return { t: 'typed', answer: sentenceFor(item, ex.bubble!).gap! }
    case 'type-da':
      return { t: 'typed', answer: gen ? generatedDanish(item, ex.bubble!.trim()) : item.da }
    case 'tiles':
      return {
        t: 'tiles',
        words: gen ? generatedDanish(item, quoted(ex.title)).split(/\s+/) : wordsOf(sentenceFor(item, ex.bubble!).da),
      }
    case 'match':
      return { t: 'match', pairs: ex.ids.map(i => ({ da: items.get(i)!.da, en: items.get(i)!.en })) }
    default:
      // audio is off, so no listening exercise may appear
      throw new Error(`Unexpected exercise kind ${ex.kind} for ${id}`)
  }
}

/** "Almost": the answer with its first ø typed as o (a dropped ø), as a learner without the key types it; null without an ø. */
export function almostOf(answer: string): string | null {
  const at = answer.indexOf('ø')
  if (at < 0) return null
  return `${answer.slice(0, at)}o${answer.slice(at + 1)}`
}

// ---------- clock and taps ----------

/**
 * The simulated clock. Each tap first moves the page clock on by `tapSeconds`, so the shell's
 * active-time timer credits that gap (it credits gaps of up to 60 s between taps).
 */
export class Clock {
  now = 0
  tapSeconds = 5
  constructor(private ctx: BrowserContext) {}
  async install(at: number) {
    this.now = at
    await this.ctx.clock.install({ time: at })
  }
  async set(at: number) {
    if (at < this.now) throw new Error('The simulated clock never goes back')
    this.now = at
    await this.ctx.clock.setSystemTime(at)
  }
  async advance(seconds: number) {
    await this.set(this.now + seconds * 1000)
  }
}

export async function tap(clock: Clock, target: import('@playwright/test').Locator) {
  await clock.advance(clock.tapSeconds)
  await target.click()
}

// ---------- reading the screen ----------

export type ScreenState =
  | 'welcome' | 'home' | 'placed' | 'exercise' | 'feedback' | 'intro' | 'repeat' | 'keep' | 'summary'

/**
 * Wait for the screen to differ from `prev` and say what it is. Each element gets a test-only
 * marker the first time it's seen, so "the same kind of screen again" (the next exercise) is told
 * apart from "still the old one" (Preact replaces keyed steps with new nodes).
 */
export async function nextScreen(page: Page, prev: string): Promise<{ key: string; state: ScreenState }> {
  const h = await page.waitForFunction(
    (p: string) => {
      const w = window as unknown as { __e2eN?: number }
      const mark = (el: Element) => {
        const d = (el as HTMLElement).dataset
        if (!d.e2e) d.e2e = String((w.__e2eN = (w.__e2eN ?? 0) + 1))
        return d.e2e
      }
      const found = (state: string, sel: string): string | null => {
        const el = document.querySelector(sel)
        return el ? `${state}:${mark(el)}` : null
      }
      const key =
        found('summary', '[data-testid=summary]') ??
        found('keep', 'main.keep') ??
        found('feedback', '[data-testid=exercise].answered .sheet[aria-label=Feedback]') ??
        found('exercise', '[data-testid=exercise]:not(.answered)') ??
        found('intro', '[data-testid=intro-card]') ??
        found('repeat', '[data-testid=repeat-line]') ??
        found('placed', 'main.placed') ??
        found('home', 'main.home') ??
        found('welcome', 'main.welcome')
      return key !== null && key !== p ? key : false
    },
    prev,
    { polling: 20, timeout: 15000 },
  )
  const key = (await h.jsonValue()) as string
  return { key, state: key.split(':')[0] as ScreenState }
}

export async function readShown(page: Page): Promise<Shown> {
  const ex = page.locator('[data-testid=exercise]:not(.answered)')
  const kind = (await ex.getAttribute('data-kind'))!
  const ids = (await ex.getAttribute('data-items'))!.split(' ')
  const title = (await ex.locator('.q h2').first().textContent()) ?? ''
  const prompt = ex.getByTestId('prompt')
  const bubble = (await prompt.count()) > 0 ? await prompt.textContent() : null
  const kicker = (await page.locator('h1.kicker').textContent()) ?? ''
  return { kind, ids, title, bubble, kicker }
}

export type Intent = 'correct' | 'almost' | 'wrong'

/** Pick how to answer: about 12 % wrong, "almost" now and then where a typed answer has æ/ø/å. */
export function chooseIntent(rng: Rng, wrongRate = 0.12): Intent {
  const r = rng()
  if (r < wrongRate) return 'wrong'
  if (r < wrongRate + 0.06) return 'almost'
  return 'correct'
}

const HEAD: Record<Intent, string> = { correct: 'Correct!', almost: 'Almost!', wrong: 'Not quite' }

/**
 * Answer the shown exercise with the given intent (downgraded to "correct" when the exercise
 * can't be answered that way, e.g. "almost" on a multiple choice). Returns the verdict the
 * feedback sheet showed, after checking it is the intended one.
 */
export async function answer(page: Page, clock: Clock, shown: Shown, want: Intent, o: { dontKnow?: boolean } = {}): Promise<Intent> {
  const ex = page.locator('[data-testid=exercise]:not(.answered)')
  const sol = solve(shown)
  let intent: Intent = want
  switch (sol.t) {
    case 'choice': {
      if (intent === 'almost') intent = 'correct'
      const buttons = ex.locator('.choices button')
      const texts = await buttons.allTextContents()
      const right = texts.findIndex(t => same(t, sol.answer))
      if (right < 0) throw new Error(`"${sol.answer}" not among ${JSON.stringify(texts)} (${shown.ids})`)
      const wrong = texts.findIndex(t => !same(t, sol.answer))
      await tap(clock, buttons.nth(intent === 'wrong' && wrong >= 0 ? wrong : right))
      if (intent === 'wrong' && wrong < 0) intent = 'correct'
      break
    }
    case 'typed': {
      let text = sol.answer
      if (intent === 'almost') {
        const a = almostOf(sol.answer)
        if (a === null) intent = 'correct'
        else text = a
      }
      if (intent === 'wrong' && o.dontKnow) {
        await tap(clock, ex.getByRole('button', { name: "Don't know" }))
        break
      }
      if (intent === 'wrong') text = 'zzz'
      const field = ex.getByRole('textbox', { name: 'Your answer' })
      await tap(clock, field)
      await field.fill(text)
      await tap(clock, ex.getByRole('button', { name: 'Check' }))
      break
    }
    case 'tiles': {
      if (intent === 'almost') intent = 'correct'
      let words = sol.words
      if (intent === 'wrong') {
        const reversed = [...words].reverse()
        if (same(reversed.join(' '), words.join(' '))) intent = 'correct'
        else words = reversed
      }
      const bank = ex.getByTestId('tile-bank')
      for (const w of words) await tap(clock, bank.getByRole('button', { name: w, exact: true }).first())
      await tap(clock, ex.getByRole('button', { name: 'Check' }))
      break
    }
    case 'match': {
      if (intent === 'almost') intent = 'correct'
      const da = ex.getByTestId('match-da')
      const en = ex.getByTestId('match-en')
      if (intent === 'wrong') {
        await tap(clock, da.getByRole('button', { name: sol.pairs[0].da, exact: true }))
        await tap(clock, en.getByRole('button', { name: sol.pairs[1].en, exact: true }))
      }
      for (const p of sol.pairs) {
        await tap(clock, da.getByRole('button', { name: p.da, exact: true }))
        await tap(clock, en.getByRole('button', { name: p.en, exact: true }))
      }
      break
    }
  }
  const head = page.locator('[data-testid=exercise].answered .sheet[aria-label=Feedback] h2')
  await expect(head, `verdict for ${shown.kind} ${shown.ids.join(' ')}`).toHaveText(HEAD[intent])
  return intent
}

export async function continueFeedback(page: Page, clock: Clock) {
  const sheet = page.locator('[data-testid=exercise].answered .sheet[aria-label=Feedback]')
  await tap(clock, sheet.getByRole('button', { name: /^(Continue|Got it)$/ }))
}
