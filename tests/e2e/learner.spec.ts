import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { GOAL_SECONDS, streak } from '../../src/lib/activity'
import { addDays } from '../../src/lib/dates'
import type { Progress } from '../../src/lib/progressTypes'
import { MIN_NEW, OVERLOAD, BACKLOG_REVIEW_CAP, REVIEW_CAP } from '../../src/lib/queue'
import { seeded } from '../../src/lib/rng'
import { STORAGE_KEY } from '../../src/lib/store'
import {
  almostOf, answer, chooseIntent, solve, Clock, continueFeedback, isSpecial, items, lessons, nextScreen, readShown, tap, units,
  type Intent, type ScreenState,
} from './learner'

/**
 * Task 23b: the built app driven as the learner over 30 simulated days.
 * Day 1 is first launch (Welcome → placement → first session); days 2-30 are daily sessions.
 */

const DAYS = 30
const FIRST_DAY = '2026-01-05' // CET all month (no DST change inside the run)
const REPORT_DAY = 10
const MIDNIGHT_DAY = 15 // ends at 23:58; the next day opens at 00:05
const BACKUP_DAY = 20

/** Placement: wrong answers per unit (6 questions each). Units 1-5 pass, 6-11 fail → start at unit 6. */
const PLACEMENT_WRONG: Record<string, number> = { u02: 1, u04: 1, u06: 3, u07: 3, u08: 3, u09: 3, u10: 3, u11: 3 }

/** Local wall-clock time in Copenhagen (UTC+1 in January). */
const at = (day: string, hhmm: string, ss = 0) => new Date(`${day}T${hhmm}:${String(ss).padStart(2, '0')}+01:00`).getTime()
const dayOf = (n: number) => addDays(FIRST_DAY, n - 1)

interface DayRow {
  day: number
  date: string
  dueAtStart: number
  reviews: number
  /** The day's review cap: 100 when more than 60 are due at the start or placement-pending items are due, else 60. */
  cap: number
  /** Reviews counted from the screen, independently of the app's reviewsDone (see session()). */
  counted: number
  /** Exercises under the Reviews kicker whose first item was shown for the first time that day. */
  shownFirst: number
  newItems: number
  minutes: number
  streak: number
  special: string | null
  repeatRound: boolean
  weakRounds: number
  wrong: number
  almost: number
}

async function stored(page: Page): Promise<Progress> {
  const text = await page.evaluate(k => localStorage.getItem(k), STORAGE_KEY)
  expect(text, 'progress in localStorage').not.toBeNull()
  return JSON.parse(text!) as Progress
}

/** Progress minus the parts a backup round trip may legitimately move: today's timer credit for the taps, and the nudge date. */
function comparable(p: Progress, today: string) {
  const days = { ...p.days }
  if (days[today]) days[today] = { ...days[today], activeSeconds: 0 }
  return { ...p, days, lastBackupNudge: null }
}

test('simulated learner: placement and 30 days of sessions', async ({ page: firstPage, context }) => {
  test.setTimeout(60 * 60 * 1000)
  const errors: string[] = []
  const watch = (p: Page) => {
    p.on('console', m => {
      if (m.type() === 'error') errors.push(`${m.text()} @ ${m.location().url}`)
    })
    p.on('pageerror', e => errors.push(e.message))
  }
  watch(firstPage)
  let page = firstPage

  // Audio off before the first load (Welcome has no Settings); everything else goes through the UI.
  await context.addInitScript(k => {
    if (localStorage.getItem(k) === null) {
      localStorage.setItem(k, JSON.stringify({ schemaVersion: 1, settings: { audio: false, speed: 1, newPerDay: 10, backupNudge: true } }))
    }
  }, STORAGE_KEY)
  // A desktop browser may offer a share sheet for files; the iPhone fallback (a download link) is what's tested here.
  await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true })
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true })
  })

  const clock = new Clock(context)
  const rng = seeded(2311)
  const rows: DayRow[] = []
  let reported: string | null = null
  let owedAlmost = 0
  let droppedO = 0 // "almost" verdicts from an answer typed with ø → o
  let midnightCredit = 0 // day 15's active seconds after the 23:57:50 tap
  const seenAfterReport: string[] = []

  // ---------- Day 1: first launch → Welcome → placement ----------
  await clock.install(at(dayOf(1), '09:00'))
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Learn Danish, 15 minutes a day' })).toBeVisible()
  await tap(clock, page.getByRole('button', { name: 'Find my level' }))
  await expect(page.locator('main.welcome')).toBeHidden()

  const wrongLeft = { ...PLACEMENT_WRONG }
  let asked = 0
  let right = 0
  let key = ''
  for (;;) {
    const s = await nextScreen(page, key)
    key = s.key
    if (s.state === 'placed') break
    if (s.state === 'feedback') {
      await continueFeedback(page, clock)
      continue
    }
    expect(s.state, 'placement shows only exercises').toBe('exercise')
    const shown = await readShown(page)
    const unit = shown.ids[0].split('-')[0]
    const wrong = (wrongLeft[unit] ?? 0) > 0
    if (wrong) wrongLeft[unit]--
    const got = await answer(page, clock, shown, wrong ? 'wrong' : 'correct', { dontKnow: asked % 2 === 0 })
    asked++
    if (got !== 'wrong') right++
  }
  const placementShare = right / asked
  expect(placementShare).toBeGreaterThan(0.6)
  expect(placementShare).toBeLessThan(0.8)
  await expect(page.locator('main.placed')).toContainText("You'll start at")
  const scores = await page.getByRole('meter').evaluateAll(els => els.map(e => Number(e.getAttribute('aria-valuenow'))))
  expect(scores.every(n => n >= 0 && n <= 100)).toBe(true)
  await tap(clock, page.getByRole('button', { name: 'Start learning' }))
  await expect(page.locator('main.home')).toBeVisible()
  const placed = await stored(page)
  expect(placed.placement.done).toBe(true)
  expect(placed.placement.startUnitId).toBe('u06')
  const placedCount = Object.keys(placed.states).length

  const specialIds = new Set([...lessons.values()].filter(isSpecial).map(l => l.id))

  // ---------- one day's session ----------
  async function session(n: number): Promise<DayRow> {
    const today = dayOf(n)
    const before = await stored(page)
    const row: DayRow = {
      day: n, date: today, dueAtStart: 0, reviews: 0, cap: REVIEW_CAP, counted: 0, shownFirst: 0, newItems: 0,
      minutes: 0, streak: 0, special: null, repeatRound: false, weakRounds: 0, wrong: 0, almost: 0,
    }
    // The cap the day should get, from the stored states (not from the app's queue).
    const rep = new Set(before.reports.map(r => r.itemId))
    const dueAtStart = (id: string) => Object.hasOwn(before.states, id) && before.states[id].due <= today && !rep.has(id)
    const dueIds = Object.keys(before.states).filter(id => items.has(id) && dueAtStart(id))
    const placementDue = dueIds.some(id => before.states[id].placed === true)
    row.cap = placementDue || dueIds.length > OVERLOAD ? BACKLOG_REVIEW_CAP : REVIEW_CAP
    // Independent review count: the due-at-start items shown under the Reviews kicker that the
    // Reviews block graded (their `seen` went up), plus the reported one (its mark is undone).
    const reviewShown = new Set<string>()
    const heads = new Set<string>()
    let reviewsEnd: Progress | null = null
    let inReviews = false
    let reportedInReviews = 0

    let reportedNow = false
    await tap(clock, page.getByRole('button', { name: /^(Start today's session|Continue)$/ }))
    await expect(page.locator('main.home')).toBeHidden()
    let k = ''
    let sawKeep = false
    for (let guard = 0; ; guard++) {
      expect(guard, 'session does not loop forever').toBeLessThan(4000)
      const s: { key: string; state: ScreenState } = await nextScreen(page, k)
      k = s.key
      const kickerEl = page.locator('main.session[data-phase]')
      const kicker = (await kickerEl.count()) > 0 ? await kickerEl.getAttribute('data-phase') : null
      if (kicker === 'Reviews') inReviews = true
      else if (inReviews && reviewsEnd === null) reviewsEnd = await stored(page)
      if (s.state === 'home') break
      switch (s.state) {
        case 'exercise': {
          const shown = await readShown(page)
          if (reported !== null) {
            expect(shown.ids, 'the reported item never comes back').not.toContain(reported)
            seenAfterReport.push(...shown.ids)
          }
          if (shown.kicker === 'Reviews') {
            if (!heads.has(shown.ids[0])) row.shownFirst++
            heads.add(shown.ids[0])
            for (const id of shown.ids) if (dueAtStart(id)) reviewShown.add(id)
          }
          // Day 10: the first single-item review is answered wrong and reported.
          const report = n === REPORT_DAY && !reportedNow && shown.kicker === 'Reviews' && shown.kind !== 'match'
          // "Almost" is a dropped ø, so it needs a typed answer with an ø: one drawn elsewhere is kept for the next such answer.
          const sol = solve(shown)
          const almostable = sol.t === 'typed' && almostOf(sol.answer) !== null
          let want: Intent = report ? 'wrong' : chooseIntent(rng)
          if (want === 'almost' && !almostable) {
            owedAlmost++
            want = 'correct'
          } else if (want === 'correct' && almostable && owedAlmost > 0) {
            owedAlmost--
            want = 'almost'
          }
          const got = await answer(page, clock, shown, want)
          if (got === 'wrong') row.wrong++
          if (got === 'almost') row.almost++
          if (want === 'almost' && got === 'almost') {
            expect(sol.t === 'typed' && sol.answer.includes('ø'), 'almost comes from a dropped ø').toBe(true)
            droppedO++
          }
          if (report && got === 'wrong') {
            reportedInReviews = 1
            const id = shown.ids[0]
            const marked = (await stored(page)).states[id]
            expect(marked.lapses, 'the wrong answer was marked').toBe(before.states[id].lapses + 1)
            await tap(clock, page.getByRole('button', { name: 'Report a problem' }))
            const dialog = page.getByRole('dialog', { name: 'Report a problem' })
            await tap(clock, dialog.getByRole('radio', { name: 'wrong translation' }))
            await tap(clock, dialog.getByRole('button', { name: 'Send report' }))
            await expect(page.getByText("Reported. It won't come up again until it's fixed.")).toBeVisible()
            const after = await stored(page)
            expect(after.states[id], 'the wrong mark is undone').toEqual(before.states[id])
            expect(after.reports.map(r => r.itemId)).toContain(id)
            reported = id
            reportedNow = true
          }
          break
        }
        case 'feedback':
          await continueFeedback(page, clock)
          break
        case 'intro':
          if (reported !== null) {
            await expect(page.getByTestId('intro-card').locator('.word'), 'the reported item is never introduced').not.toHaveText(items.get(reported)!.da)
          }
          await tap(clock, page.getByRole('button', { name: 'Next' }))
          break
        case 'repeat': {
          const kicker = await page.locator('main.session').getAttribute('data-phase')
          if (kicker === 'Repeat round' && !sawKeep) row.repeatRound = true
          await tap(clock, page.getByRole('button', { name: 'Next' }))
          break
        }
        case 'keep': {
          if (!sawKeep) expect(row.repeatRound, `day ${n}: Repeat after me round before Keep going`).toBe(true)
          sawKeep = true
          const secs = (await stored(page)).days[today]?.activeSeconds ?? 0
          const weak = page.getByRole('button', { name: 'Practise weak items' })
          if (secs < GOAL_SECONDS && (await weak.count()) > 0 && row.weakRounds < 12) {
            row.weakRounds++
            await tap(clock, weak)
          } else {
            await tap(clock, page.getByRole('button', { name: 'Finish' }))
          }
          break
        }
        case 'summary':
          await expect(page.getByTestId('stat-streak')).toBeVisible()
          await tap(clock, page.getByRole('button', { name: 'Done' }))
          break
        default:
          throw new Error(`Unexpected screen ${s.state} on day ${n}`)
      }
    }
    if (n === REPORT_DAY) expect(reportedNow, 'an item was reported on day 10').toBe(true)

    // Top up on Home if the session was short (taps on the goal card count as activity).
    for (let i = 0; (await stored(page)).days[today].activeSeconds < GOAL_SECONDS; i++) {
      expect(i).toBeLessThan(200)
      await clock.advance(20)
      await page.locator('section.goal').click()
    }

    const after = await stored(page)
    const log = after.days[today]
    row.dueAtStart = log.dueAtStart ?? 0
    row.reviews = log.reviewsDone
    const end = reviewsEnd ?? after
    row.counted = [...reviewShown].filter(id => end.states[id].seen > before.states[id].seen).length + reportedInReviews
    expect(row.counted, `day ${n}: reviews counted on screen = reviewsDone`).toBe(log.reviewsDone)
    expect(row.counted, `day ${n}: reviews within the day's cap`).toBeLessThanOrEqual(row.cap)
    expect(row.shownFirst, `day ${n}: review exercises shown`).toBeLessThanOrEqual(row.counted)
    row.newItems = log.newIntroduced
    row.minutes = Math.floor(log.activeSeconds / 60)
    const done = Object.keys(after.lessonsDone).filter(id => specialIds.has(id) && !before.lessonsDone[id])
    row.special = done.length > 0 ? done.join(',') : null
    return row
  }

  /** Home at the end of a day: goal ring closed, streak, mastery bars. */
  async function checkHome(n: number, row: DayRow) {
    await expect(page.locator('main.home')).toBeVisible()
    await expect(page.locator('section.goal')).toContainText('Goal reached. Your streak is safe today')
    const dash = await page.locator('.ring-fill').getAttribute('stroke-dasharray')
    const [filled, whole] = dash!.split(' ').map(Number)
    expect(filled, 'goal ring closed').toBeCloseTo(whole, 3)
    const pill = await page.locator('.pill').getAttribute('aria-label')
    row.streak = Number(/Streak: (\d+)/.exec(pill!)![1])
    expect(row.streak, `streak on day ${n}`).toBe(n)
    const p = await stored(page)
    expect(streak(p.days, dayOf(n))).toBe(n)

    const meters = page.getByRole('meter', { name: /mastery/ })
    await expect(meters).toHaveCount(units.length)
    const values = await meters.evaluateAll(els => els.map(e => Number(e.getAttribute('aria-valuenow'))))
    for (const v of values) expect(v).toBeGreaterThanOrEqual(0)
    for (const v of values) expect(v, 'mastery never over 100%').toBeLessThanOrEqual(100)
    const fills = await page.locator('ol.units .bar').evaluateAll(bars =>
      bars.map(b => {
        const bar = b.getBoundingClientRect()
        const fill = b.querySelector('i')!.getBoundingClientRect()
        const mark = b.querySelector('.mark')!.getBoundingClientRect()
        return { fill: fill.width / bar.width, mark: (mark.left - bar.left) / bar.width, markH: mark.height }
      }),
    )
    for (const f of fills) {
      expect(f.fill).toBeLessThanOrEqual(1.0001)
      expect(f.mark, 'the 80% mark').toBeCloseTo(0.8, 1)
      expect(f.markH).toBeGreaterThan(0)
    }
    await expect(page.getByTestId('mastery-mark').first()).toBeVisible()
  }

  // ---------- 30 days ----------
  for (let n = 1; n <= DAYS; n++) {
    const today = dayOf(n)
    if (n > 1 && n !== MIDNIGHT_DAY + 1) {
      // Between days: a new morning, reload, and the progress is unchanged.
      const lastNight = await stored(page)
      await clock.set(at(today, n === MIDNIGHT_DAY ? '22:30' : '09:00'))
      await page.reload()
      await expect(page.locator('main.home')).toBeVisible()
      expect(await stored(page), `progress survives the reload before day ${n}`).toEqual(lastNight)
    }
    if (n === MIDNIGHT_DAY + 1) {
      // Closed at 23:58 yesterday, reopened at 00:05 today.
      const lastNight = await stored(page)
      await page.close()
      await clock.set(at(today, '00:05'))
      page = await context.newPage()
      watch(page)
      await page.goto('./')
      await expect(page.locator('main.home')).toBeVisible()
      const p = await stored(page)
      const yesterday = dayOf(n - 1)
      // Closing the app at 23:58 (page hidden) credits the 10 s since the 23:57:50 tap, to yesterday.
      const closeCredit = p.days[yesterday].activeSeconds - midnightCredit
      expect(closeCredit, 'closing at 23:58 credits 23:57:50-23:58 to yesterday').toBeGreaterThanOrEqual(9.9)
      expect(closeCredit).toBeLessThan(11)
      midnightCredit = p.days[yesterday].activeSeconds
      const withoutClose = { ...p, days: { ...p.days, [yesterday]: { ...p.days[yesterday], activeSeconds: lastNight.days[yesterday].activeSeconds } } }
      expect(withoutClose, 'progress survives closing the app').toEqual(lastNight)
      expect(p.days[today], 'nothing credited to the new day yet').toBeUndefined()
      await expect(page.locator('.pill')).toHaveAttribute('aria-label', `Streak: ${n - 1} days`)
      await expect(page.locator('section.goal')).toContainText('0 of 15 minutes')
    }

    const row = await session(n)
    console.log(`day ${n}/${DAYS}: ${row.reviews} reviews, ${row.newItems} new, ${Math.floor((await stored(page)).days[today].activeSeconds / 60)} min`)
    await checkHome(n, row)
    rows.push(row)

    if (n === MIDNIGHT_DAY) {
      expect(clock.now, 'day 15 session finished before 23:57').toBeLessThan(at(today, '23:57'))
      const end = (await stored(page)).days[today].activeSeconds
      // Back on the phone just before midnight: a tap at 23:57:30 (after a long gap: no credit) and one at 23:57:50 (+20 s).
      await clock.set(at(today, '23:57', 30))
      await page.locator('section.goal').click()
      await clock.set(at(today, '23:57', 50))
      await page.locator('section.goal').click()
      await expect
        .poll(async () => (await stored(page)).days[today].activeSeconds, { message: 'the 23:57:50 tap is credited to day 15' })
        .toBeGreaterThanOrEqual(end + 19.9) // 20 s, give or take the real milliseconds between the taps
      midnightCredit = (await stored(page)).days[today].activeSeconds
      expect(midnightCredit, 'only the 20 s gap was credited').toBeLessThan(end + 22)
      await expect(page.locator('section.goal')).toContainText(`${Math.floor(midnightCredit / 60)} of 15 minutes`)
      await clock.set(at(today, '23:58'))
      // closed at 23:58 (next day's block): nothing more is credited after the last tap
      expect((await stored(page)).days[today].activeSeconds).toBe(midnightCredit)
    }
    if (n === MIDNIGHT_DAY + 1) {
      const p = await stored(page)
      expect(p.days[dayOf(n - 1)].activeSeconds, 'yesterday unchanged by today').toBe(midnightCredit)
      // today's credit is only today's own time since reopening at 00:05
      expect(p.days[today].activeSeconds).toBeLessThanOrEqual((clock.now - at(today, '00:05')) / 1000 + 1)
      expect(streak(p.days, today)).toBe(n)
    }

    if (n === BACKUP_DAY) {
      // Export → reset → import → confirm: progress identical.
      await tap(clock, page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings' }))
      const beforeExport = await stored(page)
      await tap(clock, page.getByRole('button', { name: 'Export backup' }))
      const link = page.getByRole('link', { name: /Save backup file/ })
      await expect(link).toBeVisible()
      const dl = page.waitForEvent('download')
      await tap(clock, link)
      const download = await dl
      expect(download.suggestedFilename()).toBe(`dansk-daily-backup-${today}.json`)
      const file = await download.path()
      const backup = JSON.parse(readFileSync(file, 'utf8')) as { app: string; progress: Progress }
      expect(backup.app).toBe('dansk-daily')
      expect(comparable(backup.progress, today)).toEqual(comparable(beforeExport, today))

      await tap(clock, page.getByRole('button', { name: 'Reset all progress' }))
      await tap(clock, page.getByRole('alertdialog').getByRole('button', { name: 'Reset' }))
      await expect(page.getByRole('heading', { name: 'Learn Danish, 15 minutes a day' })).toBeVisible()
      // Welcome has no Settings; the learner skips to Home, then imports.
      await tap(clock, page.getByRole('button', { name: 'Skip, start from the beginning' }))
      await tap(clock, page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings' }))
      await page.locator('input[type=file]').setInputFiles(file)
      const confirm = page.getByRole('alertdialog')
      await expect(confirm).toContainText('Replace your current progress with the backup from 24 January 2026?')
      await tap(clock, confirm.getByRole('button', { name: 'Replace' }))
      await expect(page.locator('main.home')).toBeVisible()
      expect(await stored(page), 'progress identical after export and import').toEqual(backup.progress)
      await expect(page.locator('.pill')).toHaveAttribute('aria-label', `Streak: ${n} days`)
    }
  }

  // ---------- across the 30 days ----------
  const table = [
    'day  date        due@start  cap  reviews  counted  new  minutes  streak  wrong  almost  weak  special',
    ...rows.map(r =>
      [
        String(r.day).padStart(3), r.date, String(r.dueAtStart).padStart(9), String(r.cap).padStart(4),
        String(r.reviews).padStart(8), String(r.counted).padStart(8),
        String(r.newItems).padStart(4), String(r.minutes).padStart(8), String(r.streak).padStart(7),
        String(r.wrong).padStart(6), String(r.almost).padStart(7), String(r.weakRounds).padStart(5), ` ${r.special ?? ''}`,
      ].join(' '),
    ),
  ].join('\n')
  console.log(`\nPER-DAY\n${table}`)

  const final = await stored(page)
  const learned = Object.keys(final.states).length - placedCount
  const mastered = Object.values(final.states).filter(s => s.strength >= 4).length
  const totalReviews = rows.reduce((s, r) => s + r.reviews, 0)
  const totalNew = rows.reduce((s, r) => s + r.newItems, 0)
  const short: number[] = []
  for (const r of rows) {
    expect(r.reviews, `day ${r.day}: reviews`).toBeLessThanOrEqual(r.cap)
    expect(r.minutes, `day ${r.day}: goal`).toBeGreaterThanOrEqual(GOAL_SECONDS / 60)
    expect(r.repeatRound, `day ${r.day}: Repeat after me round`).toBe(true)
    if (!r.special && r.newItems < MIN_NEW) short.push(r.day)
  }
  // At least 3 new every day, except special (recap / repeat-only) days and at most 2 short days
  // right before a special lesson's day, when the lesson before it runs out.
  for (const d of short) {
    expect(rows[d - 1].newItems, `day ${d}: some new items`).toBeGreaterThan(0)
    expect(rows[d]?.special, `day ${d} is short, so day ${d + 1} must be a special lesson's day`).toBeTruthy()
  }
  expect(short.length).toBeLessThanOrEqual(2)
  // An overloaded day (more than 60 due at its start) introduces exactly MIN_NEW, or fewer on an allowed short day.
  for (const r of rows.filter(x => x.dueAtStart > OVERLOAD && !x.special)) {
    if (short.includes(r.day)) expect(r.newItems).toBeLessThan(MIN_NEW)
    else expect(r.newItems, `day ${r.day}: overloaded`).toBe(MIN_NEW)
  }
  const almostTotal = rows.reduce((s, r) => s + r.almost, 0)
  expect(almostTotal, 'at least one Almost verdict').toBeGreaterThan(0)
  expect(droppedO, 'at least one answer with a dropped ø').toBeGreaterThan(0)
  expect(reported).not.toBeNull()
  expect(final.reports.map(r => r.itemId)).toEqual([reported])
  expect(Object.values(final.days).filter(d => d.activeSeconds >= GOAL_SECONDS)).toHaveLength(DAYS)

  // Days that started at or under the overload limit, as ranges ("1-2, 4, 18-22").
  const calm = rows.filter(r => r.dueAtStart <= OVERLOAD).map(r => r.day)
  const ranges = calm.reduce<number[][]>((acc, d) => {
    const last = acc[acc.length - 1]
    if (last && last[1] === d - 1) last[1] = d
    else acc.push([d, d])
    return acc
  }, []).map(([x, y]) => (x === y ? String(x) : `${x}-${y}`)).join(', ')
  const lastDay = rows[rows.length - 1]
  const peak = rows.reduce((a, r) => (r.dueAtStart > a.dueAtStart ? r : a), rows[0])
  const capDays = rows.filter(r => r.cap === BACKLOG_REVIEW_CAP).map(r => r.day)
  const summary = [
    `Backlog: peak ${peak.dueAtStart} due at the start of day ${peak.day}; days starting at ≤ ${OVERLOAD} due: ${ranges || 'none'}; day ${lastDay.day} started at ${lastDay.dueAtStart} due; review cap ${BACKLOG_REVIEW_CAP} on days ${capDays.length ? `${capDays[0]}-${capDays[capDays.length - 1]} (${capDays.length} days)` : 'none'}.`,
    `Almost: ${almostTotal} verdicts, ${droppedO} of them from a dropped ø.`,
    `Placement: ${asked} questions, ${Math.round(placementShare * 100)}% right; started at unit 6 with ${placedCount} words placed for review.`,
    `30 days: ${totalReviews} reviews (most in a day ${Math.max(...rows.map(r => r.reviews))}; cap ${BACKLOG_REVIEW_CAP} on backlog days, else ${REVIEW_CAP}), ${totalNew} new words (${learned} words now have a state beyond placement), ${mastered} words at mastery strength.`,
    `Every day reached 15 minutes; the streak ran 1 to ${rows[rows.length - 1].streak} with no break, through a reload each morning, a close at 23:58 and reopen at 00:05, and a backup export, reset and import on day ${BACKUP_DAY}.`,
    `Busiest start: ${Math.max(...rows.map(r => r.dueAtStart))} due (overload above ${OVERLOAD} on ${rows.filter(r => r.dueAtStart > OVERLOAD).length} days); fewest new in a day ${Math.min(...rows.map(r => r.newItems))}; special lesson days: ${rows.filter(r => r.special).map(r => `${r.day} (${r.special})`).join(', ') || 'none'}; short days: ${short.join(', ') || 'none'}.`,
    `Reported on day ${REPORT_DAY}: ${reported}; its wrong mark was undone and it never came back (${seenAfterReport.length} exercises since).`,
  ].join('\n')
  console.log(`\nSUMMARY\n${summary}`)

  expect(errors, 'no console errors').toEqual([])
})
