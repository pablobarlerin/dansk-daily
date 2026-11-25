import { useState } from 'preact/hooks'
import { normaliseAnswer } from '../../lib/answers'
import { Question, Speaker } from './shared'
import type { AnswerResult, ExerciseProps } from './types'

interface Props extends ExerciseProps {
  title: string
  bubble?: string
  /** Text played by a speaker next to the prompt (listening exercises). */
  speak?: string
  /** Options are Danish (sets lang="da" on them). */
  danishOptions?: boolean
}

/**
 * A tapped option is right or wrong: exact match after normalising, never "almost" (the
 * typing rules would let the distractor "bor" pass for "bør").
 */
function gradeChoice(option: string, ex: ExerciseProps['exercise']): AnswerResult {
  const hit = ex.accepted.find(a => normaliseAnswer(a) === normaliseAnswer(option))
  return { verdict: hit === undefined ? 'wrong' : 'correct', expected: hit ?? ex.accepted[0] ?? '', graded: [...ex.itemIds] }
}

/** Shared multiple-choice body: one tap answers. */
export function Choice({ exercise, onAnswer, canPlay, speed, locked, title, bubble, speak, danishOptions }: Props) {
  const [chosen, setChosen] = useState<number | null>(null)
  const options = exercise.options ?? []
  const right = new Set(exercise.accepted.map(normaliseAnswer))
  const listen = speak !== undefined
  const audible = listen && canPlay(speak)
  return (
    <>
      <Question title={title} bubble={listen && !audible ? speak : bubble}>
        {listen && <Speaker text={speak} canPlay={canPlay} speed={speed} big />}
      </Question>
      <div class="choices">
        {options.map((o, i) => {
          const isRight = locked && right.has(normaliseAnswer(o))
          const isWrong = locked && chosen === i && !isRight
          return (
            <button
              type="button"
              key={o}
              class={`choice${isRight ? ' is-right' : ''}${isWrong ? ' is-wrong' : ''}`}
              lang={danishOptions ? 'da' : undefined}
              disabled={locked}
              aria-pressed={chosen === i}
              onClick={() => {
                if (locked) return
                setChosen(i)
                onAnswer(gradeChoice(o, exercise))
              }}
            >
              {o}
            </button>
          )
        })}
      </div>
    </>
  )
}
