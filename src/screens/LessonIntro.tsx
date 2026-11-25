import { useEffect } from 'preact/hooks'
import { SpeakerIcon } from '../components/exercises/shared'
import type { Item } from '../content/types'
import { play, prepare } from '../lib/audio'

function TurtleIcon() {
  return (
    <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 15c0-4 3.5-7 8-7s8 3 8 7H4Z" />
      <path d="M20 13.5h1.5a1.5 1.5 0 0 0 0-3H19M7 15l-1 3M17 15l1 3" />
    </svg>
  )
}

/**
 * Play and slow-play for a Danish text. Renders nothing unless `canPlay(text)`
 * (settings.audio && a clip or voice exists); prepares the clip when it appears.
 */
export function PlayPair({ text, canPlay, speed }: { text: string; canPlay: (t: string) => boolean; speed: number }) {
  const ok = canPlay(text)
  useEffect(() => {
    if (ok) prepare(text)
  }, [text, ok])
  if (!ok) return null
  return (
    <div class="big-spk">
      <button type="button" class="spk spk-lg" aria-label="Play" onClick={() => play(text, { speed })}>
        <SpeakerIcon size={30} />
      </button>
      <button type="button" class="spk spk-lg spk-slow" aria-label="Play slowly" onClick={() => play(text, { speed, slow: true })}>
        <TurtleIcon />
      </button>
    </div>
  )
}

interface Props {
  item: Item
  /** The lesson's grammar tip, if any. */
  tip?: string
  canPlay: (text: string) => boolean
  speed: number
  /** "Next": the item starts at strength 0 and gets its first test later in the session. */
  onNext: () => void
  /** "I know this": the item starts at strength 3. */
  onKnow: () => void
}

/** A new word or phrase: hear it (normal and slow), see its forms and the lesson's tip. */
export function LessonIntro({ item, tip, canPlay, speed, onNext, onKnow }: Props) {
  const speak = item.say ?? item.da
  return (
    <div class="intro">
      <h1 class="sr-only">New word</h1>
      <div class="card-xl" data-testid="intro-card">
        <PlayPair text={speak} canPlay={canPlay} speed={speed} />
        <p class="word" lang="da">
          {item.da}
        </p>
        <p class="trans">{item.en}</p>
        {item.forms && item.forms.length > 0 && (
          <ul class="forms" aria-label="Forms">
            {item.forms.map(f => (
              <li key={f} class="chip" lang="da">
                {f}
              </li>
            ))}
          </ul>
        )}
      </div>
      {tip && <p class="tip pre-line">{tip}</p>}
      {item.note && <p class="tip pre-line">{item.note}</p>}
      <div class="ex-actions two">
        <button type="button" class="btn btn-ghost" onClick={onKnow}>
          I know this
        </button>
        <button type="button" class="btn btn-primary" onClick={onNext}>
          Next
        </button>
      </div>
    </div>
  )
}
