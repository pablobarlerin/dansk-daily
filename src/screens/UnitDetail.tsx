import { useState } from 'preact/hooks'
import { Speaker, playable } from '../components/exercises/shared'
import type { Content, Lesson, Unit } from '../content/types'
import { MASTERY_TARGET, isLessonDone, lessonSession, nextLesson, unitMastery } from '../lib/path'
import type { Progress } from '../lib/progressTypes'
import { reportedIds } from '../lib/reports'

interface Props {
  content: Content
  unit: Unit
  p: Progress
  onBack: () => void
  /** "Start this lesson" / "Practise this lesson". */
  onStartLesson: (lessonId: string) => void
  onCheckpoint: () => void
}

export function pageRange(pages: number[]): string {
  if (pages.length === 0) return ''
  const lo = Math.min(...pages)
  const hi = Math.max(...pages)
  return lo === hi ? `p. ${lo}` : `pp. ${lo}–${hi}`
}

/** The unit's non-reported items that have a state: what a checkpoint can ask. */
export function checkpointIds(unit: Unit, p: Progress): string[] {
  const rep = reportedIds(p)
  return unit.lessons.flatMap(l => l.items.map(i => i.id)).filter(id => !rep.has(id) && Object.hasOwn(p.states, id))
}

/** What "Start this lesson" would do: start (new items), practise (anything else), or nothing. */
export function lessonAction(c: Content, p: Progress, l: Lesson): 'start' | 'practise' | null {
  const ls = lessonSession(c, p, l.id)
  if (ls.newItems.length > 0) return 'start'
  if (ls.practiseIds.length > 0) return 'practise'
  const rep = reportedIds(p)
  if (l.recapOf) return (l.recapQuestions ?? []).some((_, n) => !rep.has(`${l.id}#q${n}`)) ? 'practise' : null
  if (l.items.length === 0 && (l.repeatLines ?? []).length > 0) return 'practise'
  return null
}

function lessonMeta(l: Lesson, p: Progress): string {
  const pages = pageRange(l.pages)
  const pre = pages ? `${pages} · ` : ''
  if (l.recapOf) return `${pre}recap questions`
  if (l.items.length === 0) {
    const n = (l.repeatLines ?? []).length
    return `${pre}${n} ${n === 1 ? 'line' : 'lines'} to say`
  }
  const n = l.items.length
  const learned = l.items.filter(i => Object.hasOwn(p.states, i.id)).length
  if (learned === 0 || learned === n) return `${pre}${n} ${n === 1 ? 'word' : 'words'}`
  return `${pre}${learned} of ${n} learned`
}

function CheckIcon() {
  return (
    <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

function LessonRow({ c, p, lesson, n, now, onStart }: {
  c: Content; p: Progress; lesson: Lesson; n: number; now: boolean; onStart: () => void
}) {
  const [open, setOpen] = useState(false)
  const done = isLessonDone(lesson, p)
  const action = lessonAction(c, p, lesson)
  const lines = lesson.repeatLines ?? []
  const canPlay = playable(p.settings)
  const linesId = `lines-${lesson.id}`
  return (
    <li class="lesson-li" data-testid={`lesson-${lesson.id}`}>
      <div class="lesson">
        <div class={`state${done ? ' ok' : now ? ' now' : ''}`} aria-label={done ? 'Done' : undefined} role={done ? 'img' : undefined}>
          {done ? <CheckIcon /> : <span aria-hidden="true">{n}</span>}
        </div>
        <div class="t">
          <b>{lesson.title}</b>
          <span>{lessonMeta(lesson, p)}</span>
        </div>
        {action && (
          <button
            type="button"
            class={`btn btn-sm ${action === 'start' && now ? 'btn-primary' : 'btn-ghost'}`}
            aria-label={`${action === 'start' ? 'Start' : 'Practise'} this lesson: ${lesson.title}`}
            onClick={onStart}
          >
            {action === 'start' ? 'Start' : 'Practise'}
          </button>
        )}
      </div>
      {lines.length > 0 && (
        <>
          <button
            type="button"
            class="lines-toggle"
            aria-expanded={open}
            aria-controls={linesId}
            aria-label={`Repeat lines: ${lesson.title}`}
            onClick={() => setOpen(!open)}
          >
            <svg class={`ic chev${open ? ' up' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
            Repeat lines ({lines.length})
          </button>
          {open && (
            <ul class="lines" id={linesId}>
              {lines.map(line => (
                <li key={line.da} class="line-row">
                  <div class="line-t">
                    <b lang="da">{line.da}</b>
                    <span>{line.en}</span>
                  </div>
                  <Speaker text={line.da} canPlay={canPlay} speed={p.settings.speed} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  )
}

/** A unit: mastery, checkpoint, and every lesson with its done state, start button and repeat lines. */
export function UnitDetail({ content, unit, p, onBack, onStartLesson, onCheckpoint }: Props) {
  const mastery = unitMastery(unit, p)
  const pct = Math.round(mastery * 100)
  const target = Math.round(MASTERY_TARGET * 100)
  const next = nextLesson(content, p)
  const canCheckpoint = checkpointIds(unit, p).length > 0
  return (
    <main class="screen unit-detail">
      <button type="button" class="back" aria-label="Back to Units" onClick={onBack}>
        <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Units
      </button>
      <div class="ud-h">
        <h1>{unit.title}</h1>
        <p>
          {unit.subtitle}
          {unit.pages.length > 0 ? ` · ${pageRange(unit.pages)}` : ''}
        </p>
      </div>
      <div class="mast">
        <div
          class="bar"
          role="meter"
          aria-label={`${unit.title} mastery`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={`${pct}%, target ${target}%`}
        >
          <i style={{ width: `${pct}%` }} />
          <span class="mark" />
        </div>
        <b aria-hidden="true">{pct}%</b>
      </div>
      <div class="ud-actions">
        <button type="button" class="btn btn-ghost" disabled={!canCheckpoint} onClick={onCheckpoint}>
          Checkpoint
        </button>
        {!canCheckpoint && <p class="ud-note">Start a lesson first. The checkpoint tests words you've learned.</p>}
      </div>
      <h2 class="sec">Lessons</h2>
      <ol class="lessons">
        {unit.lessons.map((l, i) => (
          <LessonRow key={l.id} c={content} p={p} lesson={l} n={i + 1} now={l === next} onStart={() => onStartLesson(l.id)} />
        ))}
      </ol>
    </main>
  )
}
