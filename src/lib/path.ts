import type { Content, Item, Lesson, RepeatLine, Unit } from '../content/types'
import type { Progress } from './progressTypes'
import type { ItemState } from './srs'
import { reportedIds } from './reports'

export const MASTERY_TARGET = 0.8

function stateOf(p: Progress, id: string): ItemState | undefined {
  return Object.hasOwn(p.states, id) ? p.states[id] : undefined
}

export function allItems(c: Content): Item[] {
  return c.units.flatMap(u => u.lessons.flatMap(l => l.items))
}

export function findItem(c: Content, id: string): { item: Item; lesson: Lesson; unit: Unit } | null {
  for (const unit of c.units)
    for (const lesson of unit.lessons) {
      const item = lesson.items.find(i => i.id === id)
      if (item) return { item, lesson, unit }
    }
  return null
}

export function isLessonDone(l: Lesson, p: Progress): boolean {
  const flagged = Object.hasOwn(p.lessonsDone, l.id) && p.lessonsDone[l.id] === true
  if (l.recapOf) return flagged
  if (l.items.length === 0) return flagged
  const rep = reportedIds(p)
  return l.items.every(i => rep.has(i.id) || stateOf(p, i.id)?.known === true)
}

export function pathOrder(c: Content, p: Progress): Lesson[] {
  const units = [...c.units].sort((a, b) => a.order - b.order)
  const idx = units.findIndex(u => u.id === p.placement.startUnitId)
  const start = idx < 0 ? 0 : idx
  return [...units.slice(start), ...units.slice(0, start)].flatMap(u => u.lessons)
}

export function nextLesson(c: Content, p: Progress): Lesson | null {
  return pathOrder(c, p).find(l => !isLessonDone(l, p)) ?? null
}

export function unitMastery(u: Unit, p: Progress): number {
  const rep = reportedIds(p)
  const items = u.lessons.filter(l => !l.recapOf).flatMap(l => l.items).filter(i => !rep.has(i.id))
  if (items.length === 0) return 0
  return items.filter(i => (stateOf(p, i.id)?.strength ?? 0) >= 4).length / items.length
}

export function weakItems(c: Content, p: Progress, n: number): string[] {
  const rep = reportedIds(p)
  return allItems(c)
    .filter(i => !rep.has(i.id) && stateOf(p, i.id))
    .map(i => ({ id: i.id, s: stateOf(p, i.id)! }))
    .sort((a, b) => a.s.strength - b.s.strength || b.s.lapses - a.s.lapses)
    .slice(0, n)
    .map(x => x.id)
}

export function lessonSession(
  c: Content,
  p: Progress,
  lessonId: string,
): { newItems: string[]; practiseIds: string[] } {
  const lesson = c.units.flatMap(u => u.lessons).find(l => l.id === lessonId)
  if (!lesson) return { newItems: [], practiseIds: [] }
  const rep = reportedIds(p)
  if (lesson.recapOf) {
    return { newItems: [], practiseIds: lesson.recapOf.filter(id => !rep.has(id) && stateOf(p, id)) }
  }
  const ids = lesson.items.map(i => i.id).filter(id => !rep.has(id))
  return {
    newItems: ids.filter(id => !stateOf(p, id)),
    practiseIds: ids.filter(id => stateOf(p, id)),
  }
}

function isStarted(l: Lesson, p: Progress): boolean {
  if (Object.hasOwn(p.lessonsDone, l.id) && p.lessonsDone[l.id]) return true
  if (l.items.some(i => stateOf(p, i.id))) return true
  return (l.repeatLines ?? []).some((_, n) => Object.hasOwn(p.repeatsSeen, `${l.id}#r${n}`))
}

export function repeatRound(
  c: Content,
  p: Progress,
  n: number,
  today: string,
): { key: string; line: RepeatLine }[] {
  const cands: { key: string; line: RepeatLine; seen: string | null }[] = []
  for (const l of pathOrder(c, p)) {
    if (!isStarted(l, p)) continue
    ;(l.repeatLines ?? []).forEach((line, i) => {
      const key = `${l.id}#r${i}`
      const seen = Object.hasOwn(p.repeatsSeen, key) ? p.repeatsSeen[key] : null
      if (seen !== today) cands.push({ key, line, seen })
    })
  }
  // stable sort: never-shown first, then oldest date; ties keep pathOrder
  cands.sort((a, b) => {
    if (a.seen === b.seen) return 0
    if (a.seen === null) return -1
    if (b.seen === null) return 1
    return a.seen < b.seen ? -1 : 1
  })
  return cands.slice(0, n).map(({ key, line }) => ({ key, line }))
}
