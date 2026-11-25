import { Choice } from './Choice'
import type { ExerciseProps } from './types'

/** Hear a word or sentence, pick its English meaning. */
export function ListenPick(props: ExerciseProps) {
  return <Choice {...props} title={props.exercise.prompt} speak={props.exercise.speak ?? ''} />
}
