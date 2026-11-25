import { Choice } from './Choice'
import type { ExerciseProps } from './types'

/** Danish word shown, pick the English. */
export function McDaEn(props: ExerciseProps) {
  return <Choice {...props} title={props.exercise.prompt} />
}
