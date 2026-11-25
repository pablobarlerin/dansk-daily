import { useEffect, useState } from 'preact/hooks'
import { ExerciseStep } from '../components/ExerciseStep'
import { playable } from '../components/exercises/shared'
import type { Content } from '../content/types'
import { makeExercise, type Exercise } from '../lib/exercises'
import { allItems, findItem } from '../lib/path'
import { applyPlacement, placementQuestions } from '../lib/placement'
import type { Progress } from '../lib/progressTypes'
import { reportedIds } from '../lib/reports'
import type { Rng } from '../lib/rng'
import { reportProgress, reportTargets } from '../state/reporting'

interface Props {
  content: Content
  p: Progress
  today: string
  update: (fn: (p: Progress) => Progress) => void
  /** Placement finished and the learner tapped "Start learning". */
  onDone: () => void
  /** "Stop for now": answers so far are kept and the test resumes next time. */
  onExit: () => void
}

const rng: Rng = Math.random
const has = (o: object, k: string) => Object.hasOwn(o, k)

/** Questions not yet answered, in unit order, without reported ids or ids gone from the content. */
function remainingIds(c: Content, p: Progress): string[] {
  const ip = p.placement.inProgress
  if (!ip) return []
  const rep = reportedIds(p)
  return Object.values(ip.questions)
    .flat()
    .filter(id => !has(ip.answers, id) && !rep.has(id) && findItem(c, id) !== null)
}

function withInProgress(p: Progress, fn: (ip: NonNullable<Progress['placement']['inProgress']>) => Progress['placement']['inProgress']): Progress {
  const ip = p.placement.inProgress
  if (!ip) return p
  return { ...p, placement: { ...p.placement, inProgress: fn(ip) } }
}

/** Drop an id from the questions and answers so it neither counts for its unit nor gets placed. */
function withoutQuestion(p: Progress, id: string): Progress {
  return withInProgress(p, ip => ({
    questions: Object.fromEntries(Object.entries(ip.questions).map(([u, ids]) => [u, ids.filter(q => q !== id)])),
    answers: Object.fromEntries(Object.entries(ip.answers).filter(([q]) => q !== id)),
  }))
}

interface Result {
  startUnitId: string | null
  unitScores: Record<string, number>
}

/** Score the test: reported ids are removed from questions and answers first and never placed. */
function finishPlacement(c: Content, p: Progress, today: string): { p: Progress; result: Result } | null {
  const ip = p.placement.inProgress
  if (!ip) return null
  const rep = reportedIds(p)
  const questions = Object.fromEntries(Object.entries(ip.questions).map(([u, ids]) => [u, ids.filter(id => !rep.has(id))]))
  const answers = Object.fromEntries(Object.entries(ip.answers).filter(([id]) => !rep.has(id)))
  const r = applyPlacement(c, p.states, questions, answers, today)
  const states = { ...r.states }
  for (const id of rep) {
    if (has(p.states, id)) states[id] = p.states[id]
    else delete states[id]
  }
  return {
    p: { ...p, states, placement: { done: true, startUnitId: r.startUnitId } },
    result: { startUnitId: r.startUnitId, unitScores: r.unitScores },
  }
}

interface Shown {
  step: number
  id: string
  ex: Exercise
}

export function Placement({ content, p, today, update, onDone, onExit }: Props) {
  const [shown, setShown] = useState<Shown | null>(null)
  const [step, setStep] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const ip = p.placement.inProgress
  const canPlay = playable(p.settings)

  // Start: store the questions (once) so the test can resume with the same ones.
  useEffect(() => {
    update(prev =>
      prev.placement.done || prev.placement.inProgress
        ? prev
        : { ...prev, placement: { ...prev.placement, inProgress: { questions: placementQuestions(content, prev, rng), answers: {} } } },
    )
  }, [])

  // Show the next remaining question, or score the test when none are left.
  useEffect(() => {
    if (shown || result || !ip) return
    const next = remainingIds(content, p)[0]
    if (next === undefined) {
      const out: { r?: Result } = {}
      update(prev => {
        const f = finishPlacement(content, prev, today)
        if (!f) return prev
        out.r = f.result
        return f.p
      })
      if (out.r) setResult(out.r)
      return
    }
    const rep = reportedIds(p)
    const pool = allItems(content).filter(i => !rep.has(i.id))
    const item = findItem(content, next)!.item
    setShown({ step, id: next, ex: makeExercise(item, 'produce', pool, rng, { canPlay }) })
  }, [shown, result, ip, p])

  if (result) return <PlacementResult content={content} result={result} onDone={onDone} />

  const total = ip ? Object.values(ip.questions).flat().length : 0
  const answered = ip ? Object.keys(ip.answers).length : 0
  const pct = total === 0 ? 0 : Math.round((answered / total) * 100)
  const item = shown ? findItem(content, shown.id)?.item : undefined

  return (
    <main class="screen session">
      <div class="prog">
        <button type="button" class="icon-btn" aria-label="Stop for now" onClick={onExit}>
          <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div
          class="track"
          role="progressbar"
          aria-label="Placement progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={answered}
          aria-valuetext={`${answered} of ${total} questions`}
        >
          {pct > 0 && <i style={{ width: `${pct}%` }} />}
        </div>
        <span class="prog-count" aria-hidden="true">
          {answered} / {total}
        </span>
      </div>
      {shown && (
        <ExerciseStep
          key={shown.step}
          exercise={shown.ex}
          canPlay={canPlay}
          speed={p.settings.speed}
          note={item?.note}
          dontKnow
          reportTargets={reportTargets(content, shown.ex)}
          onAnswer={r =>
            update(prev =>
              withInProgress(prev, cur => ({ ...cur, answers: { ...cur.answers, [shown.id]: r.verdict !== 'wrong' } })),
            )
          }
          onReport={(target, note) => update(prev => withoutQuestion(reportProgress(prev, content, target, note, today), target.id))}
          onContinue={() => {
            setStep(s => s + 1)
            setShown(null)
          }}
        />
      )}
    </main>
  )
}

function PlacementResult({ content, result, onDone }: { content: Content; result: Result; onDone: () => void }) {
  const start = content.units.find(u => u.id === result.startUnitId)
  const tested = [...content.units].sort((a, b) => a.order - b.order).filter(u => has(result.unitScores, u.id))
  return (
    <main class="screen placed">
      <div class="placed-body">
        <h1 class="placed-title">Your level</h1>
        <p class="welcome-copy">
          {start
            ? `You'll start at ${start.title}. What you got right comes back as quick reviews from tomorrow.`
            : 'You passed every unit. What you know comes back as quick reviews from tomorrow.'}
        </p>
        <ul class="units placed-units">
          {tested.map(u => {
            const pct = Math.round(result.unitScores[u.id] * 100)
            return (
              <li key={u.id} class={`unit${u.id === result.startUnitId ? ' cur' : ''}`}>
                <div class="unit-h">
                  <b>{u.title}</b>
                  <span>{pct}%</span>
                </div>
                <div class="bar" role="meter" aria-label={`${u.title} score`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                  <i style={{ width: `${pct}%` }} />
                  <span class="mark" />
                </div>
              </li>
            )
          })}
        </ul>
      </div>
      <div class="welcome-actions">
        <button type="button" class="btn btn-primary" onClick={onDone}>
          Start learning
        </button>
      </div>
    </main>
  )
}
