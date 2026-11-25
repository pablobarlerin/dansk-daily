import type { Verdict } from '../../lib/answers'
import type { Exercise } from '../../lib/exercises'

/** What an exercise reports when the learner answers. Exercises never save; the owning screen does. */
export interface AnswerResult {
  verdict: Verdict
  /** The right answer to show (the accepted answer that matched, else the first). Empty for `match`. */
  expected: string
  hint?: 'missing-article' | 'wrong-article'
  /** The ids this exercise grades: every `itemIds` entry. The runner decides which were queued. */
  graded: string[]
  /** `match` only: the pairs the learner got wrong at least once. */
  missed?: { da: string; en: string }[]
  /** `match` only: the item ids of those pairs. Only these are graded wrong; the rest are right. */
  missedIds?: string[]
}

export interface ExerciseProps {
  exercise: Exercise
  onAnswer: (r: AnswerResult) => void
  /** settings.audio && canPlay(text); see `playable`. */
  canPlay: (text: string) => boolean
  speed: number
  /** True once answered: the exercise shows its result and takes no more input. */
  locked: boolean
}
