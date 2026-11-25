import { GapOptions } from './GapOptions'
import { ListenPick } from './ListenPick'
import { ListenType } from './ListenType'
import { Match } from './Match'
import { McDaEn } from './McDaEn'
import { McEnDa } from './McEnDa'
import { PickArticle } from './PickArticle'
import { Tiles } from './Tiles'
import { TypeDa } from './TypeDa'
import { TypeGap } from './TypeGap'
import type { ExerciseProps } from './types'

/** Renders the component for the exercise's kind. */
export function ExerciseView(props: ExerciseProps) {
  switch (props.exercise.kind) {
    case 'mc-da-en': return <McDaEn {...props} />
    case 'mc-en-da': return <McEnDa {...props} />
    case 'match': return <Match {...props} />
    case 'listen-pick': return <ListenPick {...props} />
    case 'gap-options': return <GapOptions {...props} />
    case 'tiles': return <Tiles {...props} />
    case 'pick-article': return <PickArticle {...props} />
    case 'type-da': return <TypeDa {...props} />
    case 'listen-type': return <ListenType {...props} />
    case 'type-gap': return <TypeGap {...props} />
  }
}
