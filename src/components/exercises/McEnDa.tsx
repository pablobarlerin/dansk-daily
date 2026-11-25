import { Choice } from './Choice'
import type { ExerciseProps } from './types'

/** English shown (or digits/a clock for numbers and times), pick the Danish. */
export function McEnDa(props: ExerciseProps) {
  return <Choice {...props} title={props.exercise.prompt} danishOptions />
}
