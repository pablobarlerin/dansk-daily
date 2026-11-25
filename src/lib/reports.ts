import type { Progress } from './progressTypes'

export function addReport(
  p: Progress,
  target: { id: string; da: string; en: string },
  unitId: string,
  note: string,
  today: string,
  itemHash: string,
): Progress {
  return {
    ...p,
    reports: [
      ...p.reports,
      { itemId: target.id, unitId, da: target.da, en: target.en, note, day: today, itemHash },
    ],
  }
}

export function reportedIds(p: Progress): Set<string> {
  return new Set(p.reports.map(r => r.itemId))
}

export function reportsAsText(p: Progress, currentLessonId: string | null): string {
  const lines = p.reports.map(r => `${r.itemId} | ${r.unitId} | ${r.da} | ${r.en} | ${r.note}`)
  lines.push(`Current lesson: ${currentLessonId ?? 'all done'}`)
  return lines.join('\n')
}
