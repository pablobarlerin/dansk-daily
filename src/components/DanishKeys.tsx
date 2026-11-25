import type { RefObject } from 'preact'

const KEYS = ['æ', 'ø', 'å'] as const

interface Props {
  input: RefObject<HTMLInputElement | null>
  /** Called with the field's new value after a letter is inserted. */
  onChange: (value: string) => void
  disabled?: boolean
}

/** Insert `ch` at the field's cursor (replacing any selection) and put the cursor after it. */
export function insertAtCursor(el: HTMLInputElement, ch: string): string {
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? start
  const value = el.value.slice(0, start) + ch + el.value.slice(end)
  el.value = value
  el.setSelectionRange(start + ch.length, start + ch.length)
  return value
}

/** The æ ø å row under the answer field. Taps keep focus in the field so the keyboard stays up. */
export function DanishKeys({ input, onChange, disabled }: Props) {
  return (
    <div class="keys" role="group" aria-label="Danish letters">
      {KEYS.map(k => (
        <button
          type="button"
          key={k}
          class="key"
          lang="da"
          aria-label={`Type ${k}`}
          disabled={disabled}
          onPointerDown={e => e.preventDefault()}
          onMouseDown={e => e.preventDefault()}
          onClick={() => {
            const el = input.current
            if (!el) return
            onChange(insertAtCursor(el, k))
            el.focus()
          }}
        >
          {k}
        </button>
      ))}
    </div>
  )
}
