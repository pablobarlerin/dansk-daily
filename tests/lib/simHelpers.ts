import type { Content, Item, Lesson, Unit } from '../../src/content/types'
import type { Progress } from '../../src/lib/progressTypes'
import { addDays } from '../../src/lib/dates'
import type { Rng } from '../../src/lib/rng'
import { newState, review, type ItemState } from '../../src/lib/srs'
import { buildDailyQueue, type DailyQueue } from '../../src/lib/queue'

export const item = (id: string): Item => ({ id, kind: 'word', da: id, en: id })
export const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i}`)
export const lesson = (id: string, itemIds: string[], extra: Partial<Lesson> = {}): Lesson => ({
  id, title: id, pages: [1], taughtInClass: true, items: itemIds.map(item), ...extra,
})
export const unit = (n: number, lessons: Lesson[]): Unit => ({
  id: `u${n}`, order: n, title: `U${n}`, subtitle: '', pages: [1], lessons,
})
export const content = (units: Unit[]): Content => ({ version: 'v', units, hashes: {} })

export interface DayRecord {
  day: string
  queue: DailyQueue
  dueAtStart: number
  newCount: number
  special: boolean // lessonId was a recap or repeat-only lesson
}

function findLesson(c: Content, id: string): Lesson | undefined {
  return c.units.flatMap(u => u.lessons).find(l => l.id === id)
}

/** One graded answer, as the session runner does it: a wrong answer gets the normal
 *  handling and then a correct re-ask the same day that leaves strength/due alone
 *  but marks the item known and counts the extra sighting. */
function answer(s: ItemState, wrong: boolean, today: string): ItemState {
  if (!wrong) return review(s, 'correct', today)
  const after = review(s, 'wrong', today)
  return { ...after, known: true, seen: after.seen + 1 }
}

/** Runs the daily loop for `days` days starting at `start`, mutating `p`.
 *  `wrongRate` 0 → every answer correct. */
export function simulate(c: Content, p: Progress, start: string, days: number, rng: Rng, wrongRate: number): DayRecord[] {
  const out: DayRecord[] = []
  const isWrong = () => wrongRate > 0 && rng() < wrongRate
  for (let d = 0; d < days; d++) {
    const today = addDays(start, d)
    const queue = buildDailyQueue(c, p, today, {})
    // the caller stores dueAtStart on the day's first build
    const log = Object.hasOwn(p.days, today)
      ? p.days[today]
      : (p.days[today] = { activeSeconds: 0, newIntroduced: 0, reviewsDone: 0 })
    if (log.dueAtStart === undefined) log.dueAtStart = queue.dueTotal

    for (const id of queue.reviews) {
      p.states[id] = answer(p.states[id], isWrong(), today)
      log.reviewsDone += 1
    }
    // recapIds are practised off-schedule: no change to the schedule
    for (const id of queue.newItems) {
      p.states[id] = answer(newState(today), isWrong(), today)
      log.newIntroduced += 1
    }
    let special = false
    if (queue.lessonId) {
      const l = findLesson(c, queue.lessonId)
      if (l && (l.recapOf || l.items.length === 0)) {
        p.lessonsDone[l.id] = true
        special = true
      }
    }
    out.push({ day: today, queue, dueAtStart: log.dueAtStart, newCount: queue.newItems.length, special })
  }
  return out
}
