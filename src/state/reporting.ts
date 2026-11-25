import type { Content } from '../content/types'
import type { Exercise } from '../lib/exercises'
import { findItem } from '../lib/path'
import type { Progress } from '../lib/progressTypes'
import { addReport } from '../lib/reports'
import type { SessionRunner } from '../lib/sessionRunner'
import type { ItemState } from '../lib/srs'

/** What a report names: an item id (or a recap question id `<lessonId>#q<N>`) and the Danish/English shown. */
export interface ReportTarget {
  id: string
  da: string
  en: string
}

/** Unit of an item id (`u01-p09-bil`) or a recap question id (`u02-l02#q0`). */
export const unitOfId = (id: string): string => id.split('-')[0]

/**
 * The reportable targets of an exercise. Generated items (numbers, times) report the value
 * shown (`exercise.shown`); a match offers every pair; other exercises their one item.
 */
export function reportTargets(c: Content, ex: Exercise): ReportTarget[] {
  if (ex.shown) return [{ id: ex.itemIds[0], da: ex.shown.da, en: ex.shown.en }]
  return ex.itemIds.flatMap(id => {
    const f = findItem(c, id)
    return f ? [{ id, da: f.item.da, en: f.item.en }] : []
  })
}

/** Store a report with the content hash of the reported id. */
export function reportProgress(p: Progress, c: Content, target: ReportTarget, note: string, today: string): Progress {
  return addReport(p, target, unitOfId(target.id), note, today, c.hashes[target.id] ?? '')
}

/**
 * The exercise's ids whose state the runner changed when grading it: call with the states from
 * before and after `runner.answer`. For a wrong match these are exactly its queued ids.
 */
export function gradedIds(ex: Exercise, before: Record<string, ItemState>, after: Record<string, ItemState>): string[] {
  return ex.itemIds.filter(
    id => Object.hasOwn(after, id) && after[id] !== (Object.hasOwn(before, id) ? before[id] : undefined),
  )
}

/**
 * ⚑ Report inside a runner-driven session. On a wrong answer (`undo` = the graded ids) first
 * undo the mark for each and keep the restored states; then save the report and drop the
 * reported id from the rest of the session. `reviewsDone` is left as it is.
 */
export function reportWithRunner(
  p: Progress,
  c: Content,
  runner: Pick<SessionRunner, 'undoLast' | 'drop'>,
  r: { target: ReportTarget; note: string; today: string; undo: string[] },
): Progress {
  let states = p.states
  for (const id of r.undo) {
    const restored = runner.undoLast(id).states
    if (Object.hasOwn(restored, id)) states = { ...states, [id]: restored[id] }
  }
  runner.drop(r.target.id)
  return reportProgress({ ...p, states }, c, r.target, r.note, r.today)
}
