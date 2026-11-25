import { GOAL_SECONDS } from '../lib/activity'

interface Props {
  /** Review items answered this visit. */
  reviewed: number
  /** Intro cards finished this visit. */
  learned: number
  /** First-attempt right-or-almost share this visit; null when nothing was graded. */
  accuracy: number | null
  streak: number
  /** Today's active seconds (raw sum). */
  seconds: number
  onKeepGoing: () => void
  onDone: () => void
}

const R = 58
const C = 2 * Math.PI * R

export function Summary({ reviewed, learned, accuracy, streak, seconds, onKeepGoing, onDone }: Props) {
  const minutes = Math.floor(seconds / 60)
  const met = seconds >= GOAL_SECONDS
  // under a minute the round cap would draw a lone dot; the ring starts at 1m, as on Home
  const frac = minutes === 0 ? 0 : Math.min(1, seconds / GOAL_SECONDS)
  const days = `${streak} ${streak === 1 ? 'day' : 'days'} in a row.`
  return (
    <main class="screen summary" data-testid="summary">
      <div class="sum">
        <svg class="sum-ring" viewBox="0 0 140 140" aria-hidden="true">
          <circle class="sum-track" cx="70" cy="70" r={R} />
          {frac > 0 && (
            <circle class="sum-fill" cx="70" cy="70" r={R} stroke-dasharray={`${frac * C} ${C}`} transform="rotate(-90 70 70)" />
          )}
          {met ? (
            <path class="sum-check" d="M50 71l14 14 27-29" />
          ) : (
            <text class="sum-text" x="70" y="80" text-anchor="middle">
              {minutes}m
            </text>
          )}
        </svg>
        <h1>{met ? 'Goal complete' : 'Nice work'}</h1>
        <p>
          {minutes} {minutes === 1 ? 'minute' : 'minutes'} today. {met ? days : `${GOAL_SECONDS / 60 - minutes} more for today's goal.`}
        </p>
      </div>
      <div class="stats">
        <div class="stat" data-testid="stat-reviewed">
          <b>{reviewed}</b>
          <span>reviews</span>
        </div>
        <div class="stat" data-testid="stat-learned">
          <b>{learned}</b>
          <span>new words</span>
        </div>
        <div class="stat" data-testid="stat-accuracy">
          <b>{accuracy === null ? '—' : `${Math.round(accuracy * 100)}%`}</b>
          <span>accuracy</span>
        </div>
        <div class={`stat stat-streak${streak === 0 ? ' zero' : ''}`} data-testid="stat-streak">
          <b>{streak}</b>
          <span>day streak</span>
        </div>
      </div>
      <div class="ex-actions two">
        <button type="button" class="btn btn-ghost" onClick={onKeepGoing}>
          Keep going
        </button>
        <button type="button" class="btn btn-primary" onClick={onDone}>
          Done
        </button>
      </div>
    </main>
  )
}
