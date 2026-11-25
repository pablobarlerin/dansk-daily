import { useState } from 'preact/hooks'
import type { Content } from '../content/types'
import { nextLesson } from '../lib/path'
import type { Progress, Settings as Prefs } from '../lib/progressTypes'
import { reportsAsText } from '../lib/reports'
import { emptyProgress, importProgress, reconcile } from '../lib/store'
import { useBackupExport } from '../state/backup'

export interface AudioStatus {
  done: number
  total: number
}

interface Props {
  content: Content
  p: Progress
  today: string
  now: () => Date
  update: (fn: (p: Progress) => Progress) => void
  /** Replace all progress after stashing the stored copy; returns a message when it couldn't. */
  replace: (next: Progress, kind: 'replace' | 'reset') => string | null
  audio: AudioStatus
  /** After a backup was loaded; gets the progress now in use. */
  onReplaced: (next: Progress) => void
  /** After progress was reset. */
  onReset: () => void
}

const SPEED_MIN = 0.7
const SPEED_MAX = 1.2
const NEW_MIN = 3
const NEW_MAX = 20

const num = new Intl.NumberFormat('en')

function speedLabel(s: number): string {
  return s === 1 ? 'Normal' : `${s.toFixed(1)}×`
}

function stepSpeed(s: number, d: number): number {
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round((s + d) * 10) / 10))
}

function backupDate(iso: string): string {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return 'an unknown date'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function Switch({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} class="opt opt-btn" onClick={onToggle}>
      <span>{label}</span>
      <span class={`sw${on ? ' on' : ''}`} aria-hidden="true" />
    </button>
  )
}

function Stepper({
  value, label, lessLabel, moreLabel, canLess, canMore, onLess, onMore,
}: {
  value: string
  label: string
  lessLabel: string
  moreLabel: string
  canLess: boolean
  canMore: boolean
  onLess: () => void
  onMore: () => void
}) {
  return (
    <div class="opt">
      <span>{label}</span>
      <div class="step">
        <button type="button" aria-label={lessLabel} disabled={!canLess} onClick={onLess}>
          −
        </button>
        <b aria-live="polite">{value}</b>
        <button type="button" aria-label={moreLabel} disabled={!canMore} onClick={onMore}>
          +
        </button>
      </div>
    </div>
  )
}

type Confirm = { t: 'replace'; progress: Progress; exportedAt: string } | { t: 'reset' }

export function Settings({ content, p, today, now, update, replace, audio, onReplaced, onReset }: Props) {
  const s = p.settings
  const exp = useBackupExport(p, now, update)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [copyText, setCopyText] = useState<string | null>(null)

  const set = (patch: Partial<Prefs>) => update(prev => ({ ...prev, settings: { ...prev.settings, ...patch } }))

  const onFile = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    setError(null)
    setStatus(null)
    if (!file) return
    let text: string
    try {
      text = await file.text()
    } catch {
      setError("Couldn't read that file. Try picking it again.")
      return
    } finally {
      input.value = '' // so the same file can be picked again
    }
    const r = importProgress(text, today)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setConfirm({ t: 'replace', progress: reconcile(r.progress, content), exportedAt: r.exportedAt })
  }

  const doConfirm = () => {
    if (!confirm) return
    const next =
      confirm.t === 'replace'
        ? confirm.progress
        : reconcile({ ...emptyProgress(today), settings: p.settings }, content)
    const err = replace(next, confirm.t)
    setConfirm(null)
    if (err) {
      setError(err)
      return
    }
    if (confirm.t === 'replace') onReplaced(next)
    else onReset()
  }

  const copyReports = async () => {
    setError(null)
    setStatus(null)
    setCopyText(null)
    const text = reportsAsText(p, nextLesson(content, p)?.id ?? null)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
      await navigator.clipboard.writeText(text)
      setStatus('Reports copied. Paste them into a message to the teacher or the app maker.')
    } catch {
      setCopyText(text) // shown for copying by hand
    }
  }

  const exportBackup = () => {
    setError(null)
    setStatus(null)
    void exp.run()
  }

  const n = p.reports.length

  return (
    <main class="screen settings">
      <h1 class="set-h">Settings</h1>

      {error && (
        <p class="set-msg set-err" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p class="set-msg" role="status">
          {status}
        </p>
      )}

      <h2 class="gt">Practice</h2>
      <div class="group">
        <Stepper
          label="New words per day"
          value={String(s.newPerDay)}
          lessLabel="Fewer new words"
          moreLabel="More new words"
          canLess={s.newPerDay > NEW_MIN}
          canMore={s.newPerDay < NEW_MAX}
          onLess={() => set({ newPerDay: Math.max(NEW_MIN, s.newPerDay - 1) })}
          onMore={() => set({ newPerDay: Math.min(NEW_MAX, s.newPerDay + 1) })}
        />
        <Switch label="Audio" on={s.audio} onToggle={() => set({ audio: !s.audio })} />
        <Stepper
          label="Speaking speed"
          value={speedLabel(s.speed)}
          lessLabel="Slower"
          moreLabel="Faster"
          canLess={s.speed > SPEED_MIN}
          canMore={s.speed < SPEED_MAX}
          onLess={() => set({ speed: stepSpeed(s.speed, -0.1) })}
          onMore={() => set({ speed: stepSpeed(s.speed, 0.1) })}
        />
        <div class="opt" data-testid="audio-saved">
          Audio saved for offline<span class="sr-only">: </span>
          <span class="val">
            {num.format(audio.done)} of {num.format(audio.total)}
          </span>
        </div>
      </div>

      <h2 class="gt">Your progress</h2>
      <div class="group">
        <button type="button" class="opt opt-btn link" onClick={exportBackup} disabled={exp.busy}>
          Export backup
        </button>
        {exp.link && (
          <a class="opt link save-link" href={exp.link.href} download={exp.link.name}>
            Save backup file
            <span class="val">{exp.link.name}</span>
          </a>
        )}
        <label class="opt opt-btn link">
          Import backup
          <input type="file" class="sr-only" accept="application/json,.json" onChange={onFile} />
        </label>
        <Switch label="Monthly backup reminder" on={s.backupNudge} onToggle={() => set({ backupNudge: !s.backupNudge })} />
      </div>

      <h2 class="gt">Content</h2>
      <div class="group">
        <button type="button" class="opt opt-btn link" onClick={copyReports}>
          Copy reports
          <span class="val">{n === 0 ? 'No reports' : `${n} ${n === 1 ? 'report' : 'reports'}`}</span>
        </button>
        {copyText !== null && (
          <label class="opt copy-box">
            <span>Couldn't copy automatically. Select this text and copy it:</span>
            <textarea readOnly rows={Math.min(6, copyText.split('\n').length)} value={copyText} />
          </label>
        )}
        <button type="button" class="opt opt-btn danger" onClick={() => setConfirm({ t: 'reset' })}>
          Reset all progress
        </button>
      </div>

      {confirm && (
        <div class="scrim">
          <div class="sheet sheet-confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
            <h2 id="confirm-title" class="sh-h">
              {confirm.t === 'replace'
                ? `Replace your current progress with the backup from ${backupDate(confirm.exportedAt)}?`
                : 'Reset all progress?'}
            </h2>
            <p class="sh-body">
              {confirm.t === 'replace'
                ? 'A safe copy of your current progress is kept on this iPhone.'
                : 'Your words, lessons and streak start again from zero. A safe copy is kept on this iPhone.'}
            </p>
            <button type="button" class="btn btn-ghost" onClick={exportBackup} disabled={exp.busy}>
              Export backup first
            </button>
            {exp.link && (
              <a class="btn btn-ghost" href={exp.link.href} download={exp.link.name}>
                Save backup file
              </a>
            )}
            <div class="two">
              <button type="button" class="btn btn-ghost" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button type="button" class="btn btn-primary" onClick={doConfirm}>
                {confirm.t === 'replace' ? 'Replace' : 'Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
