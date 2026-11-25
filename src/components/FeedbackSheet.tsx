import { useEffect, useRef } from 'preact/hooks'
import type { Verdict } from '../lib/answers'

interface Props {
  verdict: Verdict
  /** The right answer (the correct spelling for almost). */
  expected: string
  hint?: 'missing-article' | 'wrong-article'
  /** The item's note, shown with a wrong answer. */
  note?: string
  /** `match`: the pairs that were mixed up. */
  missed?: { da: string; en: string }[]
  onContinue: () => void
  /** Opens the report sheet; omitted when there is nothing to report. */
  onReport?: () => void
  reported?: boolean
}

const HEAD: Record<Verdict, string> = { correct: 'Correct!', almost: 'Almost!', wrong: 'Not quite' }

function Icon({ verdict }: { verdict: Verdict }) {
  return (
    <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
      {verdict === 'correct' && <path d="M5 12.5l4.5 4.5L19 7.5" />}
      {verdict === 'almost' && (
        <>
          <path d="M12 8v5M12 16.5v.5" />
          <circle cx="12" cy="12" r="9" />
        </>
      )}
      {verdict === 'wrong' && <path d="M6 6l12 12M18 6L6 18" />}
    </svg>
  )
}

/** "Remember: **en** bil. The article is part of the word." */
function Hint({ expected }: { expected: string }) {
  const at = expected.indexOf(' ')
  if (at < 0) return null
  return (
    <p class="hint">
      Remember: <b lang="da">{expected.slice(0, at)}</b> <span lang="da">{expected.slice(at + 1)}</span>. The article
      is part of the word.
    </p>
  )
}

/** Slides up after an answer: verdict, right answer, hint, note, ⚑ Report and Continue. */
export function FeedbackSheet({ verdict, expected, hint, note, missed, onContinue, onReport, reported }: Props) {
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    btn.current?.focus({ preventScroll: true })
  }, [])
  return (
    <section class={`sheet sheet-${verdict}`} role="region" aria-label="Feedback" aria-live="polite">
      <h2 class="sh-h">
        <Icon verdict={verdict} />
        {HEAD[verdict]}
      </h2>
      {verdict === 'correct' && expected !== '' && (
        <p class="sh-body">
          <b lang="da">{expected}</b>
        </p>
      )}
      {verdict === 'almost' && (
        <p class="sh-body">
          Watch the spelling: <b lang="da">{expected}</b>
        </p>
      )}
      {verdict === 'wrong' && missed && missed.length > 0 && (
        <div class="sh-body">
          <p>Check these pairs:</p>
          <ul class="sh-pairs">
            {missed.map(m => (
              <li key={m.da}>
                <b lang="da">{m.da}</b> = {m.en}
              </li>
            ))}
          </ul>
        </div>
      )}
      {verdict === 'wrong' && !missed && (
        <p class="sh-body">
          Correct answer: <b lang="da">{expected}</b>
        </p>
      )}
      {verdict === 'wrong' && hint && <Hint expected={expected} />}
      {verdict === 'wrong' && note && <p class="sh-note">{note}</p>}
      {reported ? (
        <p class="flag">Reported. It won't come up again until it's fixed.</p>
      ) : (
        onReport && (
          <button type="button" class="flag" onClick={onReport}>
            <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
            </svg>
            Report a problem
          </button>
        )
      )}
      <button ref={btn} type="button" class={`btn btn-${verdict}`} onClick={onContinue}>
        {verdict === 'wrong' ? 'Got it' : 'Continue'}
      </button>
    </section>
  )
}
