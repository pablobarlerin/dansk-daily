import { useState } from 'preact/hooks'
import type { Exercise } from '../lib/exercises'
import type { ReportTarget } from '../state/reporting'
import { ExerciseView } from './exercises'
import type { AnswerResult } from './exercises/types'
import { FeedbackSheet } from './FeedbackSheet'
import { ReportSheet } from './ReportSheet'

interface Props {
  exercise: Exercise
  /** settings.audio && canPlay(text); see `playable`. */
  canPlay: (text: string) => boolean
  speed: number
  /** The item's note, shown with a wrong answer. */
  note?: string
  /** Offer a "Don't know" button (counts as wrong). */
  dontKnow?: boolean
  /** What ⚑ Report can report; empty hides it. */
  reportTargets: ReportTarget[]
  /** Called once per answer; the owning screen grades and saves. */
  onAnswer: (r: AnswerResult) => void
  /** Called when a report is sent; the owning screen saves it (and undoes a wrong mark). */
  onReport: (target: ReportTarget, note: string, r: AnswerResult) => void
  onContinue: () => void
}

/**
 * One exercise with its feedback sheet and report sheet. Holds no progress: the owning screen
 * saves, keeps the shown exercise until Continue, and gives each step its own `key`.
 */
export function ExerciseStep({ exercise, canPlay, speed, note, dontKnow, reportTargets, onAnswer, onReport, onContinue }: Props) {
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [reporting, setReporting] = useState(false)
  const [reported, setReported] = useState(false)

  const answer = (r: AnswerResult) => {
    if (result) return
    setResult(r)
    onAnswer(r)
  }

  return (
    <div
      class={`exercise${result ? ' answered' : ''}`}
      data-testid="exercise"
      data-items={exercise.itemIds.join(' ')}
      data-kind={exercise.kind}
    >
      <ExerciseView exercise={exercise} onAnswer={answer} canPlay={canPlay} speed={speed} locked={result !== null} />
      {dontKnow && !result && (
        <div class="ex-actions ex-skip">
          <button
            type="button"
            class="btn btn-ghost"
            onClick={() => answer({ verdict: 'wrong', expected: exercise.accepted[0] ?? '', graded: [...exercise.itemIds] })}
          >
            Don't know
          </button>
        </div>
      )}
      {result && (
        <FeedbackSheet
          verdict={result.verdict}
          expected={result.expected}
          hint={result.hint}
          note={note}
          missed={result.missed}
          onContinue={onContinue}
          onReport={reportTargets.length > 0 ? () => setReporting(true) : undefined}
          reported={reported}
        />
      )}
      {reporting && result && (
        <ReportSheet
          targets={reportTargets}
          onCancel={() => setReporting(false)}
          onSend={(target, text) => {
            setReporting(false)
            setReported(true)
            onReport(target, text, result)
          }}
        />
      )}
    </div>
  )
}
