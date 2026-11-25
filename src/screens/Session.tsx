import { useEffect, useRef, useState } from 'preact/hooks'
import { ExerciseStep } from '../components/ExerciseStep'
import { playable } from '../components/exercises/shared'
import type { Content, Lesson, RepeatLine } from '../content/types'
import { GOAL_SECONDS, streak } from '../lib/activity'
import type { Exercise } from '../lib/exercises'
import { findItem, lessonSession, repeatRound, weakItems } from '../lib/path'
import type { Progress } from '../lib/progressTypes'
import { OVERLOAD, buildDailyQueue, type DailyQueue } from '../lib/queue'
import { reportedIds } from '../lib/reports'
import type { Rng } from '../lib/rng'
import { newState, setStrength, type ItemState } from '../lib/srs'
import { DOUBLE_TAP_MS, tapClock } from '../lib/tapGuard'
import { reportProgress, reportTargets, type ReportTarget } from '../state/reporting'
import { answeredRight, answerRun, reportRun, startRun, withDay, type Run } from '../state/run'
import { LessonIntro } from './LessonIntro'
import { RepeatAfterMe } from './RepeatAfterMe'
import { Summary } from './Summary'

interface Props {
  content: Content
  p: Progress
  today: string
  update: (fn: (p: Progress) => Progress) => void
  /** The shell's active-time timer; called on every answer. */
  activity: () => void
  /** Leave the session (progress is already saved). */
  onExit: () => void
  /** Injected in tests; defaults to Math.random. */
  rng?: Rng
  /**
   * "Start this lesson": run this lesson instead of today's queue (no caps, no reviews, no
   * Repeat round): its new items as step 2, then its learned items off-schedule; ends at Summary.
   */
  lessonId?: string
}

const WEAK_COUNT = 15
const ROUND_COUNT = 5

type Line = { key: string; line: RepeatLine }
interface RecapQ {
  id: string
  ex: Exercise
  target: ReportTarget
}

type Phase =
  | { t: 'run'; run: Run; step: number; ex: Exercise }
  | { t: 'intro'; ids: string[]; i: number; introduced: string[] }
  | { t: 'repeat'; lines: Line[]; i: number; round: boolean }
  | { t: 'recap'; lesson: Lesson; qs: RecapQ[]; i: number; step: number }
  | { t: 'keep' }
  | { t: 'summary' }

/** A step of the session plan: builds its phase from the latest progress, or null to skip it. */
type Step = () => Phase | null

const has = (o: object, k: string) => Object.hasOwn(o, k)

function lessonById(c: Content, id: string): Lesson | undefined {
  for (const u of c.units) for (const l of u.lessons) if (l.id === id) return l
  return undefined
}

const lineKeys = (l: Lesson): Line[] => (l.repeatLines ?? []).map((line, n) => ({ key: `${l.id}#r${n}`, line }))

/**
 * The daily session, in a fixed order:
 * 1. reviews (scheduled), plus recapIds off-schedule on a recap day;
 * 2. new material (intro cards → the lesson's repeat lines → first test; or a recap lesson's
 *    questions; or a repeat-only lesson's lines);
 * 3. the Repeat after me round;
 * 4. Keep going (another lesson, weak items, finish), which never repeats step 3.
 */
export function Session({ content, p, today, update, activity, onExit, rng = () => Math.random(), lessonId }: Props) {
  const [phase, setPhase] = useState<Phase | null>(null)
  const steps = useRef<Step[]>([])
  const stepKey = useRef(0)
  const lessonEnded = useRef(false)
  const visit = useRef({ reviewed: 0, learned: 0, first: 0, good: 0 })
  const lastTap = useRef(-Infinity)
  const canPlay = playable(p.settings)

  /**
   * Intro and repeat cards replace each other under the same buttons, so the second tap of a
   * double tap would land on the next card unseen. Taps that soon after an accepted one are ignored.
   */
  const settled = (): boolean => {
    const t = tapClock.now()
    if (t >= lastTap.current && t - lastTap.current < DOUBLE_TAP_MS) return false
    lastTap.current = t
    return true
  }

  /** The latest saved progress (the prop can lag behind an update made in the same handler). */
  const read = (): Progress => {
    let cur = p
    update(prev => {
      cur = prev
      return prev // unchanged: nothing is saved
    })
    return cur
  }
  const key = () => ++stepKey.current

  const advance = () => {
    while (steps.current.length > 0) {
      const ph = steps.current.shift()!()
      if (ph) {
        setPhase(ph)
        return
      }
    }
    // a lesson started from its unit ends at Summary; the daily session offers Keep going first
    setPhase(lessonId !== undefined && !lessonEnded.current ? { t: 'summary' } : { t: 'keep' })
    lessonEnded.current = true
  }

  const runStep = (ids: string[], mode: 'scheduled' | 'off-schedule', countReviews: boolean, label: string): Step => () => {
    const started = startRun(content, read(), ids, rng, { mode, countReviews, label })
    return started ? { t: 'run', run: started.run, step: key(), ex: started.ex } : null
  }

  const markDone = (lessonId: string): Step => () => {
    update(prev => (has(prev.lessonsDone, lessonId) ? prev : { ...prev, lessonsDone: { ...prev.lessonsDone, [lessonId]: true } }))
    return null
  }

  /** Step 2 for a queue: which kind of day it is comes from the queue's lesson and new items. */
  const newMaterial = (q: Pick<DailyQueue, 'lessonId' | 'newItems'>): Step[] => {
    const lesson = q.lessonId === null ? undefined : lessonById(content, q.lessonId)
    if (!lesson) return []
    if (lesson.recapOf) {
      return [
        () => {
          const rep = reportedIds(read())
          const qs: RecapQ[] = (lesson.recapQuestions ?? []).flatMap((rq, n) => {
            const id = `${lesson.id}#q${n}`
            if (rep.has(id)) return []
            const ex: Exercise = {
              kind: 'type-da', itemIds: [id], prompt: `Answer in Danish: ${rq.prompt_en}`, accepted: rq.accepted, sentence: true,
            }
            return [{ id, ex, target: { id, da: rq.da, en: rq.prompt_en } }]
          })
          return qs.length > 0 ? { t: 'recap', lesson, qs, i: 0, step: key() } : null
        },
        markDone(lesson.id),
      ]
    }
    if (lesson.items.length === 0) {
      return [() => {
        const lines = lineKeys(lesson)
        return lines.length > 0 ? { t: 'repeat', lines, i: 0, round: false } : null
      }, markDone(lesson.id)]
    }
    if (q.newItems.length === 0) return []
    const introduced: string[] = []
    return [
      () => ({ t: 'intro', ids: q.newItems, i: 0, introduced }),
      () => {
        const cur = read()
        const lessons = new Map<string, Lesson>()
        for (const id of q.newItems) {
          const f = findItem(content, id)
          if (f) lessons.set(f.lesson.id, f.lesson)
        }
        const lines = [...lessons.values()].flatMap(lineKeys).filter(l => !has(cur.repeatsSeen, l.key))
        return lines.length > 0 ? { t: 'repeat', lines, i: 0, round: false } : null
      },
      () => runStep(introduced, 'scheduled', false, 'First test')(),
    ]
  }

  // Start: build today's queue once and plan steps 1–3 (or the one lesson's plan).
  useEffect(() => {
    const cur = read()
    if (lessonId !== undefined) {
      const lesson = lessonById(content, lessonId)
      const ls = lessonSession(content, cur, lessonId)
      steps.current = lesson?.recapOf
        ? [runStep(ls.practiseIds, 'off-schedule', false, 'Recap'), ...newMaterial({ lessonId, newItems: [] })]
        : [...newMaterial({ lessonId, newItems: ls.newItems }), runStep(ls.practiseIds, 'off-schedule', false, 'Practise')]
      advance()
      return
    }
    const q = buildDailyQueue(content, cur, today, {})
    if (!has(cur.days, today) || cur.days[today].dueAtStart === undefined) {
      update(prev => withDay(prev, today, d => ({ ...d, dueAtStart: q.dueTotal })))
    }
    steps.current = [
      runStep(q.reviews, 'scheduled', true, 'Reviews'),
      // recapIds run here only, never again later in the session
      runStep(q.recapIds, 'off-schedule', false, 'Recap'),
      ...newMaterial(q),
      () => {
        const lines = repeatRound(content, read(), ROUND_COUNT, today)
        return lines.length > 0 ? { t: 'repeat', lines, i: 0, round: true } : null
      },
    ]
    advance()
  }, [])

  // Each shown repeat line is marked seen today.
  const shownLine = phase?.t === 'repeat' ? phase.lines[phase.i].key : null
  useEffect(() => {
    if (shownLine === null) return
    update(prev => (prev.repeatsSeen[shownLine] === today ? prev : { ...prev, repeatsSeen: { ...prev.repeatsSeen, [shownLine]: today } }))
  }, [shownLine])

  if (!phase) return <main class="screen session" />

  if (phase.t === 'summary') {
    const v = visit.current
    return (
      <Summary
        reviewed={v.reviewed}
        learned={v.learned}
        accuracy={v.first === 0 ? null : v.good / v.first}
        streak={streak(p.days, today)}
        seconds={p.days[today]?.activeSeconds ?? 0}
        onKeepGoing={() => setPhase({ t: 'keep' })}
        onDone={onExit}
      />
    )
  }

  if (phase.t === 'keep') {
    const seconds = p.days[today]?.activeSeconds ?? 0
    const left = GOAL_SECONDS / 60 - Math.floor(seconds / 60)
    const extra = buildDailyQueue(content, p, today, { extra: true })
    const overloaded = (p.days[today]?.dueAtStart ?? extra.dueTotal) > OVERLOAD
    const another = !overloaded && extra.lessonId !== null
    const weak = weakItems(content, p, WEAK_COUNT)
    return (
      <main class="screen keep">
        <div class="keep-body">
          <h1 class="placed-title">Keep going?</h1>
          <p class="welcome-copy">
            {seconds >= GOAL_SECONDS
              ? 'Goal reached for today. Extra practice still helps.'
              : `${left} ${left === 1 ? 'minute' : 'minutes'} to go for today's goal.`}
          </p>
        </div>
        <div class="welcome-actions">
          {another && (
            <button
              type="button"
              class="btn btn-primary"
              onClick={() => {
                steps.current = newMaterial(buildDailyQueue(content, read(), today, { extra: true }))
                advance()
              }}
            >
              Another lesson
            </button>
          )}
          {weak.length > 0 && (
            <button
              type="button"
              class={`btn ${another ? 'btn-ghost' : 'btn-primary'}`}
              onClick={() => {
                steps.current = [runStep(weakItems(content, read(), WEAK_COUNT), 'off-schedule', false, 'Weak items')]
                advance()
              }}
            >
              Practise weak items
            </button>
          )}
          <button type="button" class="btn btn-ghost" onClick={() => setPhase({ t: 'summary' })}>
            Finish
          </button>
        </div>
      </main>
    )
  }

  let label: string
  let done: number
  let total: number
  let body
  switch (phase.t) {
    case 'run': {
      const { run, ex } = phase
      label = run.label
      done = run.answered
      total = run.answered + run.runner.remaining()
      body = (
        <ExerciseStep
          key={phase.step}
          exercise={ex}
          canPlay={canPlay}
          speed={p.settings.speed}
          note={findItem(content, ex.itemIds[0])?.item.note}
          reportTargets={reportTargets(content, ex)}
          onAnswer={r => {
            activity()
            const { first, save } = answerRun(run, ex, r.verdict, today, r.missedIds)
            const v = visit.current
            v.first += first.length
            v.good += first.filter(id => answeredRight(r, id)).length
            if (run.countReviews) v.reviewed += first.length
            update(save)
          }}
          onReport={(target, note, r) => {
            const next = reportRun(run, read(), content, { target, note, today, verdict: r.verdict })
            update(() => next)
          }}
          onContinue={() => {
            // The shown exercise only changes here, so a report under the sheet never swaps it.
            const nextEx = run.runner.current()
            if (nextEx) setPhase({ t: 'run', run, step: key(), ex: nextEx })
            else advance()
          }}
        />
      )
      break
    }
    case 'intro': {
      const id = phase.ids[phase.i]
      const f = findItem(content, id)!
      label = 'New words'
      done = phase.i
      total = phase.ids.length
      const nextCard = () => {
        if (phase.i + 1 < phase.ids.length) setPhase({ ...phase, i: phase.i + 1 })
        else advance()
      }
      const introduce = (state: (prev: Progress) => ItemState | null) => {
        activity()
        visit.current.learned++
        update(prev => {
          const s = state(prev)
          const withState = s ? { ...prev, states: { ...prev.states, [id]: s } } : prev
          return withDay(withState, today, d => ({ ...d, newIntroduced: d.newIntroduced + 1 }))
        })
        nextCard()
      }
      body = (
        <LessonIntro
          key={id}
          item={f.item}
          tip={f.lesson.tip}
          canPlay={canPlay}
          speed={p.settings.speed}
          onNext={() => {
            if (!settled()) return
            if (!has(read().states, id)) phase.introduced.push(id)
            introduce(prev => (has(prev.states, id) ? null : newState(today)))
          }}
          onKnow={() => {
            if (!settled()) return
            introduce(prev => setStrength(has(prev.states, id) ? prev.states[id] : undefined, 3, today))
          }}
        />
      )
      break
    }
    case 'repeat': {
      label = phase.round ? 'Repeat round' : 'Repeat after me'
      done = phase.i
      total = phase.lines.length
      body = (
        <RepeatAfterMe
          key={phase.lines[phase.i].key}
          line={phase.lines[phase.i].line}
          canPlay={canPlay}
          speed={p.settings.speed}
          onNext={() => {
            if (!settled()) return
            activity()
            if (phase.i + 1 < phase.lines.length) setPhase({ ...phase, i: phase.i + 1 })
            else advance()
          }}
          onSkip={
            phase.round
              ? () => {
                  steps.current = []
                  setPhase({ t: 'keep' })
                }
              : undefined
          }
        />
      )
      break
    }
    case 'recap': {
      const q = phase.qs[phase.i]
      label = phase.lesson.title
      done = phase.i
      total = phase.qs.length
      body = (
        <>
          {phase.lesson.context && phase.lesson.context.length > 0 && (
            <div class="tip context">
              {phase.lesson.context.map(t => (
                <p key={t}>{t}</p>
              ))}
            </div>
          )}
          <ExerciseStep
            key={phase.step}
            exercise={q.ex}
            canPlay={canPlay}
            speed={p.settings.speed}
            reportTargets={[q.target]}
            onAnswer={() => activity()}
            onReport={(target, note) => update(prev => reportProgress(prev, content, target, note, today))}
            onContinue={() => {
              if (phase.i + 1 < phase.qs.length) setPhase({ ...phase, i: phase.i + 1, step: key() })
              else advance()
            }}
          />
        </>
      )
      break
    }
  }

  const pct = total === 0 ? 0 : Math.round((Math.min(done, total) / total) * 100)
  return (
    <main class="screen session">
      <div class="prog">
        <button type="button" class="icon-btn" aria-label="End session" onClick={onExit}>
          <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div
          class="track"
          role="progressbar"
          aria-label={`${label} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
      <h1 class="kicker">{label}</h1>
      {body}
    </main>
  )
}
