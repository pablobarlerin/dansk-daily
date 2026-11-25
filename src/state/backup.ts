import { useState } from 'preact/hooks'
import { localDay } from '../lib/dates'
import type { Progress } from '../lib/progressTypes'
import { exportProgress } from '../lib/store'

export interface DownloadLink {
  href: string
  name: string
}

export type ExportResult = { kind: 'shared' } | { kind: 'cancelled' } | { kind: 'link'; link: DownloadLink }

export function backupFileName(now: Date): string {
  return `dansk-daily-backup-${localDay(now)}.json`
}

function linkFor(file: File, json: string): DownloadLink {
  let href: string
  try {
    href = URL.createObjectURL(file)
  } catch {
    href = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`
  }
  return { href, name: file.name }
}

/**
 * Export progress as dansk-daily-backup-YYYY-MM-DD.json. Uses the share sheet ("Save to Files",
 * Mail…) when it takes files; otherwise returns a download link for the screen to show.
 */
export async function exportBackup(p: Progress, now: Date): Promise<ExportResult> {
  const json = exportProgress(p, now)
  const file = new File([json], backupFileName(now), { type: 'application/json' })
  let canShareFiles = false
  try {
    canShareFiles = typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [file] })
  } catch {
    canShareFiles = false
  }
  if (canShareFiles) {
    try {
      await navigator.share({ files: [file] })
      return { kind: 'shared' }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return { kind: 'cancelled' }
      // Share refused for another reason: fall back to the link.
    }
  }
  return { kind: 'link', link: linkFor(file, json) }
}

/** Shared by Settings and Home's backup nudge: runs the export and records lastBackupNudge. */
export function useBackupExport(p: Progress, now: () => Date, update: (fn: (p: Progress) => Progress) => void) {
  const [link, setLink] = useState<DownloadLink | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (): Promise<ExportResult | null> => {
    if (busy) return null
    setBusy(true)
    setLink(null)
    const at = now()
    const day = localDay(at)
    update(prev => ({ ...prev, lastBackupNudge: day }))
    try {
      const r = await exportBackup(p, at)
      if (r.kind === 'link') setLink(r.link)
      return r
    } finally {
      setBusy(false)
    }
  }

  return { run, link, busy }
}
