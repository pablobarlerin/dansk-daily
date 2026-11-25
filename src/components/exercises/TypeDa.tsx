import { splitPrompt } from './shared'
import { Typed } from './Typed'
import type { ExerciseProps } from './types'

/** English shown (or digits/a clock for numbers and times), type the Danish. */
export function TypeDa(props: ExerciseProps) {
  const [title, bubble] = splitPrompt(props.exercise.prompt)
  return <Typed {...props} title={title ?? 'Write this in Danish'} bubble={bubble} />
}
