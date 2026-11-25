import { Choice } from './Choice'
import type { ExerciseProps } from './types'

/** Sentence with a gap ("\n" then the English); pick the missing word. */
export function GapOptions(props: ExerciseProps) {
  return <Choice {...props} title="Fill the gap" bubble={props.exercise.prompt} danishOptions />
}
