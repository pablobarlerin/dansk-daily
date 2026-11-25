import { useEffect, useState } from 'preact/hooks'
import { Brand } from '../components/Brand'
import type { Content, Unit } from '../content/types'
import { GOAL_SECONDS, streak } from '../lib/activity'
import { MASTERY_TARGET, nextLesson, unitMastery } from '../lib/path'
import type { Progress } from '../lib/progressTypes'
import { shouldNudgeBackup } from '../lib/store'
import { useBackupExport } from '../state/backup'

interface Props {
  content: Content
  p: Progress
  today: string
  update: (fn: (p: Progress) => Progress) => void
  now: () => Date
  onStartSession: () => void
  /** Tapping a unit card opens its unit screen. */
  onOpenUnit: (unitId: string) => void
}

const GOAL_MINUTES = GOAL_SECONDS / 60
const RING_R = 30
const RING_C = 2 * Math.PI * RING_R

function pageRange(pages: number[]): string {
  if (pages.length === 0) return ''
  const lo = Math.min(...pages)
  const hi = Math.max(...pages)
  return lo === hi ? `p. ${lo}` : `pp. ${lo}–${hi}`
}

function GoalRing({ seconds }: { seconds: number }) {
  const frac = Math.min(1, seconds / GOAL_SECONDS)
  const minutes = Math.floor(seconds / 60)
  return (
    <svg class="ring" viewBox="0 0 72 72" aria-hidden="true">
      <circle class="ring-track" cx="36" cy="36" r={RING_R} />
      {frac > 0 && (
        <circle
          class="ring-fill"
          cx="36"
          cy="36"
          r={RING_R}
          stroke-dasharray={`${frac * RING_C} ${RING_C}`}
          transform="rotate(-90 36 36)"
        />
      )}
      <text class="ring-text" x="36" y="41" text-anchor="middle">
        {minutes}m
      </text>
    </svg>
  )
}

function UnitCard({ unit, p, current, onOpen }: { unit: Unit; p: Progress; current: boolean; onOpen: () => void }) {
  const mastery = unitMastery(unit, p)
  const pct = Math.round(mastery * 100)
  const mastered = mastery >= MASTERY_TARGET
  const target = Math.round(MASTERY_TARGET * 100)
  return (
    <li
      class={`unit${current ? ' cur' : ''}${mastered ? ' done' : ''}`}
      data-testid={`unit-${unit.id}`}
      aria-current={current ? 'step' : undefined}
    >
      <div class="unit-h">
        <b>
          {/* the whole card is the tap target (the button's ::after covers it) */}
          <button type="button" class="unit-open" onClick={onOpen}>
            {unit.title}
          </button>
        </b>
        <span>
          {pct}%{mastered ? ' · mastered' : ''}
        </span>
      </div>
      {current && <div class="meta">You're here · {pageRange(unit.pages)}</div>}
      <div
        class="bar"
        role="meter"
        aria-label={`${unit.title} mastery`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%, target ${target}%`}
      >
        <i style={{ width: `${pct}%` }} />
        <span class="mark" data-testid="mastery-mark" />
      </div>
    </li>
  )
}

/** The unit cards, in order, with the current unit marked. Used by Home and the Units tab. */
export function UnitList({ content, p, onOpenUnit }: { content: Content; p: Progress; onOpenUnit: (unitId: string) => void }) {
  const next = nextLesson(content, p)
  const currentUnitId = next ? content.units.find(u => u.lessons.includes(next))?.id : undefined
  const units = [...content.units].sort((a, b) => a.order - b.order)
  return (
    <ol class="units">
      {units.map(u => (
        <UnitCard key={u.id} unit={u} p={p} current={u.id === currentUnitId} onOpen={() => onOpenUnit(u.id)} />
      ))}
    </ol>
  )
}

export function Home({ content, p, today, update, now, onStartSession, onOpenUnit }: Props) {
  const [nudge, setNudge] = useState(false)
  const backup = useBackupExport(p, now, update)

  useEffect(() => {
    if (shouldNudgeBackup(p, today)) {
      setNudge(true)
      update(prev => ({ ...prev, lastBackupNudge: today }))
    }
    // Checked once per visit to Home; showing it sets lastBackupNudge, which turns the check off.
  }, [])

  const dismissNudge = () => {
    setNudge(false)
    update(prev => ({ ...prev, lastBackupNudge: today }))
  }

  const backUp = async () => {
    const r = await backup.run()
    if (r?.kind === 'shared') setNudge(false)
  }

  const seconds = p.days[today]?.activeSeconds ?? 0
  const minutes = Math.floor(seconds / 60)
  const goalMet = seconds >= GOAL_SECONDS
  const left = GOAL_MINUTES - minutes
  const days = streak(p.days, today)

  return (
    <main class="screen home">
      <div class="top">
        <Brand />
        <div class="pill" aria-label={`Streak: ${days} ${days === 1 ? 'day' : 'days'}`}>
          <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.8 2.5-5 .3 1.6 1.2 2.5 2.2 2.8C11 8.5 11.3 5.5 12 3Z" />
          </svg>
          <span aria-hidden="true">{days}</span>
        </div>
      </div>

      <section class="goal" aria-label="Today's goal">
        <GoalRing seconds={seconds} />
        <div>
          <b>
            {minutes} of {GOAL_MINUTES} minutes
          </b>
          <span>
            {goalMet
              ? 'Goal reached. Your streak is safe today'
              : `${left} more to keep your streak going`}
          </span>
        </div>
      </section>

      <div class="home-cta">
        <button type="button" class="btn btn-primary" onClick={onStartSession}>
          Start today's session
        </button>
      </div>

      {nudge && (
        <section class="nudge" aria-label="Backup reminder">
          <div class="nudge-t">
            <b>Save a backup?</b>
            <span>Your progress lives only on this iPhone. Save a copy to Files now and then.</span>
            {backup.link && (
              <a class="nudge-link" href={backup.link.href} download={backup.link.name}>
                Save backup file
              </a>
            )}
          </div>
          <div class="nudge-actions">
            <button type="button" class="btn btn-primary btn-sm" onClick={backUp} disabled={backup.busy}>
              Back up
            </button>
            <button type="button" class="btn btn-ghost btn-sm" onClick={dismissNudge}>
              Not now
            </button>
          </div>
        </section>
      )}

      <h2 class="sec">Units</h2>
      <UnitList content={content} p={p} onOpenUnit={onOpenUnit} />
    </main>
  )
}
