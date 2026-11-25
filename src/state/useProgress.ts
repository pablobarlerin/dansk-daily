import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import type { Content } from '../content/types'
import { onEvent, type ActivityEvent, type Credit, type TimerState } from '../lib/activity'
import { localDay } from '../lib/dates'
import type { DayLog, Progress } from '../lib/progressTypes'
import { loadProgress, reconcile, saveProgress, SCHEMA_VERSION, STORAGE_KEY } from '../lib/store'

export const UNREADABLE_PREFIX = 'dansk-daily:progress-unreadable-'
/** Safe copies before a Replace/Reset: '<prefix><kind>-<day>', then '-2', '-3'… the same day. */
export const BEFORE_PREFIX = 'dansk-daily:progress-before-'

export const SAFE_COPY_ERROR =
  "Couldn't keep a safe copy of your current progress, so nothing was changed. " +
  'Storage may be full, or Private Browsing may be on. Free up some space and try again.'

export const SAVE_ERROR =
  "Couldn't save your progress on this iPhone. Storage may be full, or Private Browsing may be on. " +
  'Free up some space and keep the app open; your progress since the last save may be lost.'
export const STASH_ERROR =
  "Your saved progress couldn't be read, and there's no room to keep a safe copy of it. " +
  "Nothing will be saved until space is freed, so the old data isn't overwritten."
export const UNREADABLE_NOTICE =
  "Your saved progress couldn't be read, so the app started fresh. A copy of it was kept on this iPhone. " +
  'If you have a backup file, use Import backup in Settings to carry on where you left off.'

/** True when stored text exists but loadProgress would throw it away (corrupt or newer schema). */
function isUnreadable(text: string): boolean {
  try {
    const raw: unknown = JSON.parse(text)
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return true
    const v = (raw as { schemaVersion?: unknown }).schemaVersion
    return typeof v === 'number' && v > SCHEMA_VERSION
  } catch {
    return true
  }
}

/**
 * Keep `text` under `base`, else `base-2`, `base-3`…: an existing copy is never overwritten,
 * and text already kept in one of them isn't written again. Throws when storage refuses.
 */
function keepCopy(storage: Storage, base: string, text: string): void {
  for (let n = 1; ; n++) {
    const key = n === 1 ? base : `${base}-${n}`
    const existing = storage.getItem(key)
    if (existing === text) return
    if (existing === null) {
      storage.setItem(key, text)
      return
    }
  }
}

export interface StartResult {
  p: Progress
  newContent: boolean
  error: string | null
  /** Saving is blocked because unreadable data couldn't be stashed. */
  blocked: boolean
}

/** Start-up: load, protect unreadable data, reconcile with content, save. Never throws. */
export function startProgress(storage: Storage, content: Content, today: string): StartResult {
  let text: string | null = null
  try {
    text = storage.getItem(STORAGE_KEY)
  } catch {
    text = null
  }
  let blocked = false
  let error: string | null = null
  if (text !== null && isUnreadable(text)) {
    try {
      keepCopy(storage, UNREADABLE_PREFIX + today, text)
      error = UNREADABLE_NOTICE
    } catch {
      blocked = true
      error = STASH_ERROR
    }
  }
  const loaded = loadProgress(storage, today)
  const newContent = loaded.contentVersion !== null && loaded.contentVersion !== content.version
  const p = reconcile(loaded, content)
  // Fresh storage isn't saved until the learner does something, so contentVersion stays
  // unset until real first use.
  if (text !== null && !blocked) {
    try {
      saveProgress(storage, p)
    } catch {
      error = error === null ? SAVE_ERROR : `${error} ${SAVE_ERROR}`
    }
  }
  return { p, newContent, error, blocked }
}

export function addCredits(p: Progress, credits: Credit[]): Progress {
  if (credits.length === 0) return p
  const days = { ...p.days }
  for (const { day, seconds } of credits) {
    const log: DayLog = days[day] ?? { activeSeconds: 0, newIntroduced: 0, reviewsDone: 0 }
    days[day] = { ...log, activeSeconds: log.activeSeconds + seconds }
  }
  return { ...p, days }
}

export interface ProgressApi {
  p: Progress
  today: string
  /** Apply a change and save it. */
  update: (fn: (p: Progress) => Progress) => void
  /** Record an answer (or other activity) for the active-time timer. */
  activity: () => void
  saveError: string | null
  dismissSaveError: () => void
  newContent: boolean
  dismissNewContent: () => void
  /**
   * Replace all progress (import or reset). First stashes the raw stored progress under
   * 'dansk-daily:progress-before-<kind>-<today>' (or the next free '-2', '-3'… slot, so an
   * earlier copy is never overwritten); if that fails nothing changes.
   * Returns null on success, or a readable message.
   */
  replace: (next: Progress, kind: 'replace' | 'reset') => string | null
}

export function useProgress(content: Content, storage: Storage, now: () => Date): ProgressApi {
  const [start] = useState(() => startProgress(storage, content, localDay(now())))
  const [p, setP] = useState(start.p)
  const [saveError, setSaveError] = useState<string | null>(start.error)
  const [newContent, setNewContent] = useState(start.newContent)
  const pRef = useRef(p)
  const blocked = useRef(start.blocked)
  const timer = useRef<TimerState>({
    lastActivity: null,
    visible: typeof document === 'undefined' || document.visibilityState !== 'hidden',
  })

  const update = useCallback(
    (fn: (p: Progress) => Progress) => {
      const next = fn(pRef.current)
      if (next === pRef.current) return
      pRef.current = next
      setP(next)
      if (blocked.current) {
        // Not saved: keep warning on every skipped save, even after OK was tapped.
        setSaveError(STASH_ERROR)
        return
      }
      try {
        saveProgress(storage, next)
      } catch {
        setSaveError(SAVE_ERROR)
      }
    },
    [storage],
  )

  const replace = useCallback(
    (next: Progress, kind: 'replace' | 'reset'): string | null => {
      try {
        const raw = storage.getItem(STORAGE_KEY)
        if (raw !== null) keepCopy(storage, `${BEFORE_PREFIX}${kind}-${localDay(now())}`, raw)
      } catch {
        return SAFE_COPY_ERROR
      }
      // Whatever was stored (even unreadable data) is now kept safe, so saving may resume.
      if (blocked.current) {
        blocked.current = false
        setSaveError(e => (e === STASH_ERROR ? null : e))
      }
      pRef.current = next
      setP(next)
      try {
        saveProgress(storage, next)
      } catch {
        setSaveError(SAVE_ERROR)
      }
      return null
    },
    [storage, now],
  )

  const feed = useCallback(
    (type: ActivityEvent['type']) => {
      const r = onEvent(timer.current, { type, at: now().getTime() })
      timer.current = r.t
      if (r.credit.length) update(prev => addCredits(prev, r.credit))
    },
    [now, update],
  )

  useEffect(() => {
    const act = () => feed('activity')
    const vis = () => feed(document.visibilityState === 'hidden' ? 'hidden' : 'visible')
    document.addEventListener('pointerdown', act, true)
    document.addEventListener('keydown', act, true)
    document.addEventListener('visibilitychange', vis)
    return () => {
      document.removeEventListener('pointerdown', act, true)
      document.removeEventListener('keydown', act, true)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [feed])

  return {
    p,
    today: localDay(now()),
    update,
    activity: () => feed('activity'),
    saveError,
    dismissSaveError: () => setSaveError(null),
    newContent,
    dismissNewContent: () => setNewContent(false),
    replace,
  }
}
