import type { ComponentChildren } from 'preact'
import { useEffect } from 'preact/hooks'
import { checkAnswer } from '../../lib/answers'
import { canPlay as audioCanPlay, play, prepare } from '../../lib/audio'
import type { Exercise } from '../../lib/exercises'
import type { Settings } from '../../lib/progressTypes'
import type { AnswerResult } from './types'

/** The `canPlay` every screen passes to exercises and runners: audio on and a clip or voice exists. */
export function playable(settings: Settings): (text: string) => boolean {
  return text => settings.audio && audioCanPlay(text)
}

/** Grade an answer the one way every exercise does (shared rule). */
export function grade(input: string, ex: Exercise): AnswerResult {
  const r = checkAnswer(input, ex.accepted, { gender: ex.gender, sentence: ex.sentence })
  return { verdict: r.verdict, expected: r.expected, ...(r.hint ? { hint: r.hint } : {}), graded: [...ex.itemIds] }
}

/** "Type in Danish: a car" → ["Type in Danish", "a car"]; no ": " before the first line break → [null, prompt]. */
export function splitPrompt(prompt: string): [string | null, string] {
  const at = prompt.indexOf(': ')
  const nl = prompt.indexOf('\n')
  if (at < 0 || (nl >= 0 && nl < at)) return [null, prompt]
  return [prompt.slice(0, at), prompt.slice(at + 2)]
}

export function SpeakerIcon({ size = 24 }: { size?: number }) {
  return (
    <svg class="ic" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10v4h4l5 4V6L8 10H4Z" />
      <path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  )
}

/** Speaker button; renders nothing unless `canPlay(text)`. Prepares the clip when it appears. */
export function Speaker({ text, canPlay, speed, big }: { text: string; canPlay: (t: string) => boolean; speed: number; big?: boolean }) {
  const ok = canPlay(text)
  useEffect(() => {
    if (ok) prepare(text)
  }, [text, ok])
  if (!ok) return null
  return (
    <button type="button" class={`spk${big ? ' spk-lg' : ''}`} aria-label="Play the Danish" onClick={() => play(text, { speed })}>
      <SpeakerIcon size={big ? 34 : 24} />
    </button>
  )
}

/** Exercise heading plus an optional prompt bubble (kept on several lines with pre-line). */
export function Question({ title, bubble, children }: { title: string; bubble?: string; children?: ComponentChildren }) {
  return (
    <div class="q">
      <h2>{title}</h2>
      {(bubble !== undefined || children) && (
        <div class="prompt">
          {children}
          {bubble !== undefined && (
            <p class="bubble pre-line" data-testid="prompt">
              {bubble}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
