import { useEffect, useRef, useState } from 'preact/hooks'
import { DanishKeys } from '../DanishKeys'
import { grade, Question, Speaker } from './shared'
import type { ExerciseProps } from './types'

interface Props extends ExerciseProps {
  title: string
  bubble?: string
  speak?: string
}

/** Shared typing body: field with æ ø å keys and a Check button. */
export function Typed({ exercise, onAnswer, canPlay, speed, locked, title, bubble, speak }: Props) {
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const listen = speak !== undefined
  const audible = listen && canPlay(speak)
  // Set as an attribute (not the boolean property) so spellcheck="false" is always in the markup.
  useEffect(() => {
    input.current?.setAttribute('spellcheck', 'false')
  }, [])
  useEffect(() => {
    if (locked) input.current?.blur()
  }, [locked])
  const submit = (e: Event) => {
    e.preventDefault()
    if (locked || value.trim() === '') return
    onAnswer(grade(value, exercise))
  }
  return (
    <form class="typed" onSubmit={submit}>
      <Question title={title} bubble={listen && !audible ? speak : bubble}>
        {listen && <Speaker text={speak} canPlay={canPlay} speed={speed} big />}
      </Question>
      <input
        ref={input}
        class="field"
        type="text"
        aria-label="Your answer"
        placeholder={listen ? 'Type in Danish' : 'Type here'}
        value={value}
        onInput={e => setValue((e.target as HTMLInputElement).value)}
        readOnly={locked}
        autocapitalize="off"
        autocorrect="off"
        autocomplete="off"
        lang="da"
        enterkeyhint="done"
      />
      <DanishKeys input={input} onChange={setValue} disabled={locked} />
      <div class="ex-actions">
        <button type="submit" class="btn btn-primary" disabled={locked || value.trim() === ''}>
          Check
        </button>
      </div>
    </form>
  )
}
