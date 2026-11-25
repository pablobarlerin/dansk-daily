import type { ItemState } from './srs'

export interface Report {
  itemId: string // item id or recap question id
  unitId: string
  da: string
  en: string
  note: string
  day: string
  itemHash: string // content.hashes[itemId] at report time
}
export interface Settings {
  audio: boolean
  speed: number // 0.7-1.2
  newPerDay: number // 3-20
  backupNudge: boolean
}
export interface DayLog {
  activeSeconds: number
  newIntroduced: number
  reviewsDone: number
  dueAtStart?: number
}
export interface Progress {
  schemaVersion: 1
  firstUse: string
  states: Record<string, ItemState>
  lessonsDone: Record<string, true>
  repeatsSeen: Record<string, string>
  placement: {
    done: boolean
    startUnitId: string | null
    inProgress?: { questions: Record<string, string[]>; answers: Record<string, boolean> }
  }
  days: Record<string, DayLog>
  reports: Report[]
  settings: Settings
  lastBackupNudge: string | null
  contentVersion: string | null
}
