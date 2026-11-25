import { Typed } from './Typed'
import type { ExerciseProps } from './types'

/** Hear a word or sentence, type it. */
export function ListenType(props: ExerciseProps) {
  return <Typed {...props} title={props.exercise.prompt} speak={props.exercise.speak ?? ''} />
}
