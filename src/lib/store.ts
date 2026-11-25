import type { Content } from '../content/types'
import { daysBetween } from './dates'
import type { DayLog, Progress, Report, Settings } from './progressTypes'
import { MAX_STRENGTH, type ItemState } from './srs'

export const STORAGE_KEY = 'dansk-daily:progress'
export const SCHEMA_VERSION = 1

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function isDay(v: unknown): v is string {
  if (typeof v !== 'string' || !DAY_RE.test(v)) return false
  try {
    daysBetween(v, v)
    return true
  } catch {
    return false
  }
}
function str(v: unknown, d = ''): string {
  return typeof v === 'string' ? v : d
}
function num(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

export function emptyProgress(today: string): Progress {
  return {
    schemaVersion: 1,
    firstUse: today,
    states: {},
    lessonsDone: {},
    repeatsSeen: {},
    placement: { done: false, startUnitId: null },
    days: {},
    reports: [],
    settings: { audio: true, speed: 1.0, newPerDay: 10, backupNudge: true },
    lastBackupNudge: null,
    contentVersion: null,
  }
}

function repairState(v: unknown, today: string): ItemState | null {
  if (!isObj(v)) return null
  const strength = clamp(Math.floor(num(v.strength, 0)), 0, MAX_STRENGTH)
  const s: ItemState = {
    strength,
    due: isDay(v.due) ? v.due : today,
    lapses: Math.max(0, Math.floor(num(v.lapses, 0))),
    seen: Math.max(0, Math.floor(num(v.seen, 0))),
    known: typeof v.known === 'boolean' ? v.known : strength >= 1,
  }
  if (v.placed === true) s.placed = true
  return s
}

function repairReport(v: unknown, today: string): Report | null {
  if (!isObj(v) || typeof v.itemId !== 'string') return null
  return {
    itemId: v.itemId,
    unitId: str(v.unitId),
    da: str(v.da),
    en: str(v.en),
    note: str(v.note),
    day: isDay(v.day) ? v.day : today,
    itemHash: str(v.itemHash),
  }
}

function repairSettings(v: unknown, d: Settings): Settings {
  if (!isObj(v)) return d
  return {
    audio: typeof v.audio === 'boolean' ? v.audio : d.audio,
    speed: clamp(num(v.speed, d.speed), 0.7, 1.2),
    newPerDay: clamp(Math.round(num(v.newPerDay, d.newPerDay)), 3, 20),
    backupNudge: typeof v.backupNudge === 'boolean' ? v.backupNudge : d.backupNudge,
  }
}

function repairDayLog(v: unknown): DayLog | null {
  if (!isObj(v)) return null
  const log: DayLog = {
    activeSeconds: Math.max(0, num(v.activeSeconds, 0)),
    newIntroduced: Math.max(0, num(v.newIntroduced, 0)),
    reviewsDone: Math.max(0, num(v.reviewsDone, 0)),
  }
  if (typeof v.dueAtStart === 'number' && Number.isFinite(v.dueAtStart)) log.dueAtStart = v.dueAtStart
  return log
}

function repairPlacement(v: unknown, d: Progress['placement']): Progress['placement'] {
  if (!isObj(v)) return d
  const out: Progress['placement'] = {
    done: typeof v.done === 'boolean' ? v.done : false,
    startUnitId: typeof v.startUnitId === 'string' ? v.startUnitId : null,
  }
  const ip = v.inProgress
  if (isObj(ip) && isObj(ip.questions) && isObj(ip.answers)) {
    const questions: Record<string, string[]> = {}
    for (const [k, q] of Object.entries(ip.questions)) {
      if (Array.isArray(q)) questions[k] = q.filter((x): x is string => typeof x === 'string')
    }
    const answers: Record<string, boolean> = {}
    for (const [k, a] of Object.entries(ip.answers)) {
      if (typeof a === 'boolean') answers[k] = a
    }
    out.inProgress = { questions, answers }
  }
  return out
}

export function migrate(raw: unknown, today: string): Progress {
  const base = emptyProgress(today)
  if (!isObj(raw)) return base
  // v1 is the only schema so far: identity, then fill/repair every field.
  const states: Record<string, ItemState> = {}
  if (isObj(raw.states)) {
    for (const [id, s] of Object.entries(raw.states)) {
      const r = repairState(s, today)
      if (r) states[id] = r
    }
  }
  const lessonsDone: Record<string, true> = {}
  if (isObj(raw.lessonsDone)) {
    for (const [id, v] of Object.entries(raw.lessonsDone)) if (v) lessonsDone[id] = true
  }
  const repeatsSeen: Record<string, string> = {}
  if (isObj(raw.repeatsSeen)) {
    for (const [id, v] of Object.entries(raw.repeatsSeen)) if (typeof v === 'string') repeatsSeen[id] = v
  }
  const days: Record<string, DayLog> = {}
  if (isObj(raw.days)) {
    for (const [d, v] of Object.entries(raw.days)) {
      const r = repairDayLog(v)
      if (r) days[d] = r
    }
  }
  const reports: Report[] = []
  if (Array.isArray(raw.reports)) {
    for (const v of raw.reports) {
      const r = repairReport(v, today)
      if (r) reports.push(r)
    }
  }
  return {
    schemaVersion: 1,
    firstUse: isDay(raw.firstUse) ? raw.firstUse : today,
    states,
    lessonsDone,
    repeatsSeen,
    placement: repairPlacement(raw.placement, base.placement),
    days,
    reports,
    settings: repairSettings(raw.settings, base.settings),
    lastBackupNudge: isDay(raw.lastBackupNudge) ? raw.lastBackupNudge : null,
    contentVersion: typeof raw.contentVersion === 'string' ? raw.contentVersion : null,
  }
}

export function loadProgress(storage: Storage, today: string): Progress {
  try {
    const text = storage.getItem(STORAGE_KEY)
    if (text === null) return emptyProgress(today)
    const raw: unknown = JSON.parse(text)
    if (isObj(raw) && typeof raw.schemaVersion === 'number' && raw.schemaVersion > SCHEMA_VERSION) {
      return emptyProgress(today)
    }
    return migrate(raw, today)
  } catch {
    return emptyProgress(today)
  }
}

export function saveProgress(storage: Storage, p: Progress): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(p))
}

export function exportProgress(p: Progress, now: Date): string {
  return JSON.stringify({ app: 'dansk-daily', exportedAt: now.toISOString(), progress: p }, null, 2)
}

export function importProgress(
  json: string,
  today: string,
): { ok: true; progress: Progress; exportedAt: string } | { ok: false; error: string } {
  const notBackup = { ok: false as const, error: "This file isn't a Dansk Daily backup." }
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return notBackup
  }
  if (!isObj(parsed) || parsed.app !== 'dansk-daily' || !isObj(parsed.progress)) return notBackup
  const p = parsed.progress
  const v = p.schemaVersion
  if (typeof v === 'number' && v > SCHEMA_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of the app. Update the app and try again.' }
  }
  if (v !== undefined && (typeof v !== 'number' || v < 0)) return notBackup
  if (v === undefined && !isObj(p.states) && !isObj(p.settings)) return notBackup
  return {
    ok: true,
    progress: migrate(p, today),
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
  }
}

export function reconcile(p: Progress, c: Content): Progress {
  return {
    ...p,
    reports: p.reports.filter(r => {
      const h = c.hashes[r.itemId]
      return h !== undefined && h === r.itemHash
    }),
    contentVersion: c.version,
  }
}

export function shouldNudgeBackup(p: Progress, today: string): boolean {
  if (!p.settings.backupNudge) return false
  return daysBetween(p.lastBackupNudge ?? p.firstUse, today) >= 30
}
