import { useEffect, useState } from 'preact/hooks'
import { Brand } from '../components/Brand'
import type { Content, Unit } from '../content/types'
import { GOAL_SECONDS, streak } from '../lib/activity'
import { MASTERY_TARGET, nextLesson, unitMastery } from '../lib/path'
import type { Progress } from '../lib/progressTypes'
import { buildDailyQueue } from '../lib/queue'
import { reportedIds } from '../lib/reports'
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
  const minutes = Math.floor(seconds / 60)
  // Under a minute the round cap of a near-empty arc reads as a stray red dot: draw nothing until 1m.
  const frac = minutes === 0 ? 0 : Math.min(1, seconds / GOAL_SECONDS)
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

/**
 * Words of the unit that slipped: answered wrong at some point, back at strength 0–1 and due
 * by today, so today's reviews bring them back.
 */
export function slippedCount(unit: Unit, p: Progress, today: string): number {
  const rep = reportedIds(p)
  let n = 0
  for (const l of unit.lessons)
    for (const i of l.items) {
      if (rep.has(i.id) || !Object.hasOwn(p.states, i.id)) continue
      const s = p.states[i.id]
      if (s.lapses > 0 && s.strength <= 1 && s.due <= today) n++
    }
  return n
}

/** The line under the primary button: what today's session holds, then where the path goes next. */
export function sessionCaption(content: Content, p: Progress, today: string): { left: string; right: string } {
  const q = buildDailyQueue(content, p, today, {})
  const reviews = q.reviews.length + q.recapIds.length
  const parts: string[] = []
  if (reviews > 0) parts.push(`${reviews} ${reviews === 1 ? 'review' : 'reviews'}`)
  if (q.newItems.length > 0) parts.push(`${q.newItems.length} new`)
  const next = nextLesson(content, p)
  const pages = next ? pageRange(next.pages) : ''
  return { left: parts.join(' · '), right: pages ? `Next: ${pages}` : '' }
}

/** A session counts as started once anything was answered or practised today. */
export function startedToday(p: Progress, today: string): boolean {
  const d = Object.hasOwn(p.days, today) ? p.days[today] : undefined
  return !!d && (d.activeSeconds > 0 || d.reviewsDone > 0 || d.newIntroduced > 0)
}

function UnitCard({ unit, p, today, current, onOpen }: { unit: Unit; p: Progress; today: string; current: boolean; onOpen: () => void }) {
  const mastery = unitMastery(unit, p)
  const slipped = slippedCount(unit, p, today)
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
          {slipped > 0 && <span class="slip-dot" aria-hidden="true" />}
        </b>
        <span>
          {pct}%{mastered ? ' · mastered' : ''}
        </span>
      </div>
      {current && <div class="meta">You're here · {pageRange(unit.pages)}</div>}
      {slipped > 0 && (
        <div class="meta" data-testid="slipped">
          {slipped === 1 ? "1 word slipped, it'll come back today" : `${slipped} words slipped, they'll come back today`}
        </div>
      )}
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
export function UnitList({
  content,
  p,
  today,
  onOpenUnit,
}: {
  content: Content
  p: Progress
  today: string
  onOpenUnit: (unitId: string) => void
}) {
  const next = nextLesson(content, p)
  const currentUnitId = next ? content.units.find(u => u.lessons.includes(next))?.id : undefined
  const units = [...content.units].sort((a, b) => a.order - b.order)
  return (
    <ol class="units">
      {units.map(u => (
        <UnitCard key={u.id} unit={u} p={p} today={today} current={u.id === currentUnitId} onOpen={() => onOpenUnit(u.id)} />
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
  const caption = sessionCaption(content, p, today)

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
          {startedToday(p, today) ? 'Continue' : "Start today's session"}
        </button>
        {(caption.left || caption.right) && (
          <p class="cta-cap" data-testid="session-caption">
            <span>{caption.left}</span>
            <span>{caption.right}</span>
          </p>
        )}
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
      <UnitList content={content} p={p} today={today} onOpenUnit={onOpenUnit} />
    </main>
  )
}
