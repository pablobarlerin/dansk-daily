import { splitPrompt } from './shared'
import { Typed } from './Typed'
import type { ExerciseProps } from './types'

/** "Fill the gap: Jeg har en ___.\nI have a car.": type the missing word. */
export function TypeGap(props: ExerciseProps) {
  const [title, bubble] = splitPrompt(props.exercise.prompt)
  return <Typed {...props} title={title ?? 'Fill the gap'} bubble={bubble} />
}
