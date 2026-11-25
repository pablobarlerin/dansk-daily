import type { Content, Item, Lesson } from '../content/types'
import type { Progress } from './progressTypes'
import type { Rng } from './rng'
import { reportedIds } from './reports'
import { addDays } from './dates'
import { setStrength, type ItemState } from './srs'

export const PER_UNIT = 6
export const PASS = 0.8
export const PLACEMENT_PER_DAY = 50

function shuffled<T>(xs: T[], rng: Rng): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}

const orderedUnits = (c: Content) => [...c.units].sort((a, b) => a.order - b.order)
const itemsOf = (lessons: Lesson[]): Item[] => lessons.flatMap(l => l.items)

export function placementQuestions(c: Content, p: Progress, rng: Rng): Record<string, string[]> {
  const rep = reportedIds(p)
  const out: Record<string, string[]> = {}
  for (const u of orderedUnits(c)) {
    const taught = itemsOf(u.lessons.filter(l => l.taughtInClass)).filter(i => !rep.has(i.id))
    const skipped = itemsOf(u.lessons.filter(l => !l.taughtInClass)).filter(i => !rep.has(i.id))
    const chosen = shuffled(taught, rng).slice(0, PER_UNIT)
    if (chosen.length < PER_UNIT) chosen.push(...shuffled(skipped, rng).slice(0, PER_UNIT - chosen.length))
    if (chosen.length > 0) out[u.id] = chosen.map(i => i.id)
  }
  return out
}

export function applyPlacement(
  c: Content,
  states: Record<string, ItemState>,
  questions: Record<string, string[]>,
  answers: Record<string, boolean>,
  today: string,
): { states: Record<string, ItemState>; startUnitId: string | null; unitScores: Record<string, number> } {
  const has = (o: object, k: string) => Object.hasOwn(o, k)
  const unitScores: Record<string, number> = {}
  const raises: { id: string; strength: number }[] = []
  let startUnitId: string | null = null

  for (const u of orderedUnits(c)) {
    const asked = (has(questions, u.id) ? questions[u.id] : []).filter(id => has(answers, id))
    const correct = asked.filter(id => answers[id] === true)
    const score = asked.length === 0 ? 1 : correct.length / asked.length
    const passed = score >= PASS
    if (asked.length > 0) unitScores[u.id] = score
    if (!passed && startUnitId === null) startUnitId = u.id
    const ok = new Set(correct)
    for (const l of u.lessons)
      for (const i of l.items) {
        if (ok.has(i.id)) raises.push({ id: i.id, strength: 3 })
        else if (passed && l.taughtInClass) raises.push({ id: i.id, strength: 2 })
      }
  }

  const next = { ...states }
  const placed = raises.filter(r => {
    const cur = has(states, r.id) ? states[r.id] : undefined
    return !cur || cur.strength < r.strength
  })
  const sorted = [...placed.filter(r => r.strength === 2), ...placed.filter(r => r.strength === 3)]
  sorted.forEach((r, n) => {
    const cur = has(states, r.id) ? states[r.id] : undefined
    next[r.id] = {
      ...setStrength(cur, r.strength, today),
      due: addDays(today, 1 + Math.floor(n / PLACEMENT_PER_DAY)),
      placed: true,
    }
  })
  return { states: next, startUnitId, unitScores }
}
