import { useState } from 'preact/hooks'
import type { ReportTarget } from '../state/reporting'

export const REPORT_NOTES = ['wrong translation', 'wrong en/et', 'wrong audio'] as const

interface Props {
  targets: ReportTarget[]
  onSend: (target: ReportTarget, note: string) => void
  onCancel: () => void
}

/** ⚑ Report: the three fixed notes plus free text; a match asks which pair. */
export function ReportSheet({ targets, onSend, onCancel }: Props) {
  const [which, setWhich] = useState(0)
  const [fixed, setFixed] = useState<string | null>(null)
  const [text, setText] = useState('')
  const free = text.trim()
  const note = fixed && free ? `${fixed}: ${free}` : (fixed ?? free)
  return (
    <div class="scrim">
      <div class="sheet sheet-report" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <h2 id="report-title" class="sh-h">
          Report a problem
        </h2>
        {targets.length > 1 && (
          <fieldset class="report-group">
            <legend>Which one?</legend>
            {targets.map((t, i) => (
              <label key={t.id} class="report-opt">
                <input type="radio" name="report-target" checked={which === i} onChange={() => setWhich(i)} />
                <span>
                  <span lang="da">{t.da}</span> = {t.en}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <fieldset class="report-group">
          <legend>What's wrong?</legend>
          {REPORT_NOTES.map(n => (
            <label key={n} class="report-opt">
              <input type="radio" name="report-note" checked={fixed === n} onChange={() => setFixed(n)} />
              <span>{n}</span>
            </label>
          ))}
        </fieldset>
        <label class="report-text">
          <span>Anything else (optional)</span>
          <textarea rows={2} value={text} onInput={e => setText((e.target as HTMLTextAreaElement).value)} />
        </label>
        <div class="two">
          <button type="button" class="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" class="btn btn-primary" disabled={note === ''} onClick={() => onSend(targets[which], note)}>
            Send report
          </button>
        </div>
      </div>
    </div>
  )
}
