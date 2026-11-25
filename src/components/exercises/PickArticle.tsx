import { Choice } from './Choice'
import type { ExerciseProps } from './types'

/** "Which article? ___ bil (a car)": en or et. */
export function PickArticle(props: ExerciseProps) {
  const p = props.exercise.prompt
  const at = p.indexOf('? ')
  const [title, bubble] = at < 0 ? ['Which article?', p] : [p.slice(0, at + 1), p.slice(at + 2)]
  return <Choice {...props} title={title} bubble={bubble} danishOptions />
}
