import type { Content, Lesson } from '../content/types'
import type { Progress } from './progressTypes'
import { isDue, type ItemState } from './srs'
import { reportedIds } from './reports'
import { isLessonDone, nextLesson, pathOrder } from './path'

export const REVIEW_CAP = 60
/** 2026-11-25 (learner): on a day with more than OVERLOAD reviews due at the start (or placement items still due), the daily review cap is 100; otherwise 60. */
export const BACKLOG_REVIEW_CAP = 100
export const OVERLOAD = 60
export const MIN_NEW = 3

export interface DailyQueue {
  reviews: string[]
  recapIds: string[]
  newItems: string[]
  lessonId: string | null
  dueTotal: number
}

function stateOf(p: Progress, id: string): ItemState | undefined {
  return Object.hasOwn(p.states, id) ? p.states[id] : undefined
}

/** Recap lessons and lessons with only repeat lines: they add no new items. */
function isSpecial(l: Lesson): boolean {
  return l.recapOf !== undefined || l.items.length === 0
}

/**
 * Today's queue. Pure: it never writes `dueAtStart`; the caller stores `dueTotal`
 * as `days[today].dueAtStart` on the day's first build.
 */
export function buildDailyQueue(c: Content, p: Progress, today: string, opts: { extra?: boolean }): DailyQueue {
  const rep = reportedIds(p)
  const log = Object.hasOwn(p.days, today) ? p.days[today] : undefined

  // reviews: due, non-reported items that exist in the content
  const due: { id: string; s: ItemState }[] = []
  const seenIds = new Set<string>()
  for (const u of c.units)
    for (const l of u.lessons)
      for (const i of l.items) {
        if (seenIds.has(i.id) || rep.has(i.id)) continue
        seenIds.add(i.id)
        const s = stateOf(p, i.id)
        if (s && isDue(s, today)) due.push({ id: i.id, s })
      }
  due.sort((a, b) => (a.s.due < b.s.due ? -1 : a.s.due > b.s.due ? 1 : a.s.strength - b.s.strength))
  const dueTotal = due.length
  // dueAtStart is the day's first-build value, so the cap stays stable as reviews are done
  const dueAtStart = log?.dueAtStart ?? dueTotal
  // placement-pending: placed by applyPlacement and not reviewed since (srs.review clears `placed`)
  const cap = dueAtStart > OVERLOAD || due.some(d => d.s.placed === true) ? BACKLOG_REVIEW_CAP : REVIEW_CAP
  const reviewRoom = Math.max(0, cap - (log?.reviewsDone ?? 0))
  const reviews = due.slice(0, reviewRoom).map(d => d.id)

  const overloaded = dueAtStart > OVERLOAD
  const base: DailyQueue = { reviews, recapIds: [], newItems: [], lessonId: null, dueTotal }

  const next = nextLesson(c, p)
  if (!next) return base
  if (next.recapOf) {
    const inReviews = new Set(reviews)
    const recapIds = next.recapOf.filter(id => !rep.has(id) && stateOf(p, id) && !inReviews.has(id))
    return { ...base, recapIds, lessonId: next.id }
  }
  if (isSpecial(next)) return { ...base, lessonId: next.id }

  const perDay = p.settings.newPerDay
  let limit: number
  if (opts.extra) limit = overloaded ? 0 : Infinity
  else limit = Math.max(0, (overloaded ? Math.min(perDay, MIN_NEW) : perDay) - (log?.newIntroduced ?? 0))
  if (limit === 0) return base

  const order = pathOrder(c, p)
  const newItems: string[] = []
  let lessonId: string | null = null
  for (const l of order.slice(order.indexOf(next))) {
    if (isSpecial(l)) {
      if (isLessonDone(l, p)) continue
      break
    }
    const fresh = l.items.map(i => i.id).filter(id => !rep.has(id) && !stateOf(p, id) && !newItems.includes(id))
    if (fresh.length === 0) continue
    lessonId ??= l.id
    newItems.push(...fresh.slice(0, limit - newItems.length))
    // "Another lesson": all stateless items of the first lesson that has any
    if (opts.extra || newItems.length >= limit) break
  }
  return { ...base, newItems, lessonId }
}
