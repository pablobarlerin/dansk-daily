import { useRef, useState } from 'preact/hooks'
import { ExerciseStep } from '../components/ExerciseStep'
import { playable } from '../components/exercises/shared'
import type { Content, Unit } from '../content/types'
import type { Exercise } from '../lib/exercises'
import { findItem } from '../lib/path'
import type { Progress } from '../lib/progressTypes'
import type { Rng } from '../lib/rng'
import { reportTargets } from '../state/reporting'
import { answerRun, reportRun, startRun, type Run } from '../state/run'
import { checkpointIds } from './UnitDetail'

export const CHECKPOINT_SIZE = 10

interface Props {
  content: Content
  unit: Unit
  p: Progress
  today: string
  update: (fn: (p: Progress) => Progress) => void
  /** The shell's active-time timer; called on every answer. */
  activity: () => void
  /** Back to the unit (progress is already saved). */
  onExit: () => void
  /** Injected in tests; defaults to Math.random. */
  rng?: Rng
}

/** Up to `n` ids picked at random (Fisher–Yates on a copy). */
function pick(ids: string[], n: number, rng: Rng): string[] {
  const a = [...ids]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, n)
}

type Phase = { t: 'run'; run: Run; step: number; ex: Exercise } | { t: 'score' }

/**
 * The unit checkpoint: up to 10 random started, non-reported items of the unit, all asked as
 * produce exercises off-schedule (correct = no change, wrong = reviewed as wrong). The score is
 * right-or-almost first attempts over items asked; a reported item leaves the score.
 */
export function Checkpoint({ content, unit, p, today, update, activity, onExit, rng = () => Math.random() }: Props) {
  const firstResult = useRef(new Map<string, boolean>())
  const stepKey = useRef(0)
  const [phase, setPhase] = useState<Phase>(() => {
    const ids = pick(checkpointIds(unit, p), CHECKPOINT_SIZE, rng)
    const started = startRun(content, p, ids, rng, { mode: 'off-schedule', countReviews: false, label: 'Checkpoint', level: 'produce' })
    return started ? { t: 'run', run: started.run, step: 0, ex: started.ex } : { t: 'score' }
  })

  /** The latest saved progress (the prop can lag behind an update made in the same handler). */
  const read = (): Progress => {
    let cur = p
    update(prev => {
      cur = prev
      return prev
    })
    return cur
  }

  if (phase.t === 'score') {
    const results = [...firstResult.current.values()]
    const right = results.filter(Boolean).length
    return (
      <main class="screen checkpoint-done">
        <div class="sum">
          <h1>Checkpoint</h1>
          <p class="cp-score" data-testid="checkpoint-score">
            <b>{right}</b> / {results.length}
          </p>
          <p>{results.length === 0 ? 'Nothing was asked.' : 'Right or almost on the first try.'}</p>
        </div>
        <div class="ex-actions">
          <button type="button" class="btn btn-primary" onClick={onExit}>
            Back to unit
          </button>
        </div>
      </main>
    )
  }

  const { run, ex } = phase
  const done = run.answered
  const total = run.answered + run.runner.remaining()
  const pct = total === 0 ? 0 : Math.round((Math.min(done, total) / total) * 100)
  return (
    <main class="screen session">
      <div class="prog">
        <button type="button" class="icon-btn" aria-label="End checkpoint" onClick={onExit}>
          <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div class="track" role="progressbar" aria-label="Checkpoint progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
      <h1 class="kicker">{unit.title} · Checkpoint</h1>
      <ExerciseStep
        key={phase.step}
        exercise={ex}
        canPlay={playable(p.settings)}
        speed={p.settings.speed}
        note={findItem(content, ex.itemIds[0])?.item.note}
        reportTargets={reportTargets(content, ex)}
        onAnswer={r => {
          activity()
          const { first, save } = answerRun(run, ex, r.verdict, today)
          for (const id of first) firstResult.current.set(id, r.verdict !== 'wrong')
          update(save)
        }}
        onReport={(target, note, r) => {
          const next = reportRun(run, read(), content, { target, note, today, verdict: r.verdict })
          firstResult.current.delete(target.id)
          update(() => next)
        }}
        onContinue={() => {
          // The shown exercise only changes here, so a report under the sheet never swaps it.
          const nextEx = run.runner.current()
          setPhase(nextEx ? { t: 'run', run, step: ++stepKey.current, ex: nextEx } : { t: 'score' })
        }}
      />
    </main>
  )
}
