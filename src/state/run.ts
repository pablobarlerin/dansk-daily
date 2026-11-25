import type { Verdict } from '../lib/answers'
import type { Content } from '../content/types'
import type { Exercise } from '../lib/exercises'
import { allItems, findItem } from '../lib/path'
import type { DayLog, Progress } from '../lib/progressTypes'
import { reportedIds } from '../lib/reports'
import type { Rng } from '../lib/rng'
import { SessionRunner } from '../lib/sessionRunner'
import type { ItemState, Level } from '../lib/srs'
import { gradedIds, reportWithRunner, type ReportTarget } from './reporting'
import { playable } from '../components/exercises/shared'

/** One runner-driven practice block (daily session, "Start this lesson", checkpoint). */
export interface Run {
  runner: SessionRunner
  /**
   * The states last fed to or returned by the runner. `gradedIds` compares by object identity, so
   * this is never cloned or JSON round-tripped: it is the runner's own `states` result.
   */
  states: Record<string, ItemState>
  /** Ids not yet answered once: their next graded answer is a first attempt. */
  pending: Set<string>
  /** Scheduled reviews: the first graded answer to each adds 1 to `reviewsDone`. */
  countReviews: boolean
  /** Ids the runner graded on the last answer (undone by a report on a wrong answer). */
  lastGraded: string[]
  answered: number
  label: string
}

const has = (o: object, k: string) => Object.hasOwn(o, k)

export function withDay(p: Progress, today: string, fn: (d: DayLog) => DayLog): Progress {
  const log: DayLog = has(p.days, today) ? p.days[today] : { activeSeconds: 0, newIntroduced: 0, reviewsDone: 0 }
  return { ...p, days: { ...p.days, [today]: fn(log) } }
}

/**
 * A runner over the ids that still have a state, aren't reported and exist; null when none is
 * left or no exercise can be made. The pool never holds reported items.
 */
export function startRun(
  content: Content,
  p: Progress,
  ids: string[],
  rng: Rng,
  o: { mode: 'scheduled' | 'off-schedule'; countReviews: boolean; label: string; level?: Level },
): { run: Run; ex: Exercise } | null {
  const rep = reportedIds(p)
  const list = ids.filter(id => has(p.states, id) && !rep.has(id) && findItem(content, id) !== null)
  if (list.length === 0) return null
  const pool = allItems(content).filter(i => !rep.has(i.id))
  const runner = new SessionRunner(content, p.states, list, rng, {
    canPlay: playable(p.settings), mode: o.mode, pool, ...(o.level ? { level: o.level } : {}),
  })
  const ex = runner.current()
  if (!ex) return null
  const run: Run = { runner, states: p.states, pending: new Set(list), countReviews: o.countReviews, lastGraded: [], answered: 0, label: o.label }
  return { run, ex }
}

/**
 * Grade the shown exercise in the runner. Returns the ids answered for the first time and the
 * progress change to save: the graded ids get the runner's own state objects (not copies), and
 * scheduled reviews add their first attempts to `reviewsDone`.
 */
export function answerRun(
  run: Run,
  ex: Exercise,
  verdict: Verdict,
  today: string,
): { first: string[]; save: (prev: Progress) => Progress } {
  const first = ex.itemIds.filter(id => run.pending.has(id))
  for (const id of first) run.pending.delete(id)
  const before = run.states
  const after = run.runner.answer(verdict, today).states
  run.states = after
  run.answered++
  const graded = gradedIds(ex, before, after)
  run.lastGraded = graded
  const save = (prev: Progress): Progress => {
    let next = prev
    if (graded.length > 0) {
      const states = { ...prev.states }
      for (const id of graded) states[id] = after[id] // the runner's objects, not copies
      next = { ...next, states }
    }
    if (run.countReviews && first.length > 0) {
      next = withDay(next, today, d => ({ ...d, reviewsDone: d.reviewsDone + first.length }))
    }
    return next
  }
  return { first, save }
}

/** ⚑ Report inside a run: undo a wrong answer's marks, save the report, drop the id from the run. */
export function reportRun(
  run: Run,
  p: Progress,
  content: Content,
  r: { target: ReportTarget; note: string; today: string; verdict: Verdict },
): Progress {
  // Keep run.states equal to the runner's own states after each undo.
  const tracked = {
    undoLast: (id: string) => {
      const res = run.runner.undoLast(id)
      run.states = res.states
      return res
    },
    drop: (id: string) => run.runner.drop(id),
  }
  const undo = r.verdict === 'wrong' ? run.lastGraded : []
  const next = reportWithRunner(p, content, tracked, { target: r.target, note: r.note, today: r.today, undo })
  run.pending.delete(r.target.id)
  return next
}
