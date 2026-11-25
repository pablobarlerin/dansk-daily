import type { RepeatLine } from '../content/types'
import { PlayPair } from './LessonIntro'

interface Props {
  line: RepeatLine
  canPlay: (text: string) => boolean
  speed: number
  onNext: () => void
  /** The end-of-session round offers Skip; a lesson's own lines don't. */
  onSkip?: () => void
}

/**
 * One line to say out loud: Danish, English and the book's tip, with play and slow-play.
 * Never scored and never uses the microphone. Without audio for the line: text and Next only.
 */
export function RepeatAfterMe({ line, canPlay, speed, onNext, onSkip }: Props) {
  return (
    <div class="repeat">
      <h2 class="repeat-h">Repeat after me</h2>
      <p class="repeat-sub">Listen, then say it out loud.</p>
      <div class="card-xl" data-testid="repeat-line">
        <PlayPair text={line.da} canPlay={canPlay} speed={speed} />
        <p class="line-da" lang="da">
          {line.da}
        </p>
        <p class="trans">{line.en}</p>
      </div>
      {line.tip && <p class="tip pre-line">{line.tip}</p>}
      <div class={`ex-actions${onSkip ? ' two' : ''}`}>
        {onSkip && (
          <button type="button" class="btn btn-ghost" onClick={onSkip}>
            Skip
          </button>
        )}
        <button type="button" class="btn btn-primary" onClick={onNext}>
          Next
        </button>
      </div>
    </div>
  )
}
