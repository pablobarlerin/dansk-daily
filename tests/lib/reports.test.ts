import { describe, it, expect } from 'vitest'
import { addReport, reportedIds, reportsAsText } from '../../src/lib/reports'
import { emptyProgress } from '../../src/lib/store'

const TODAY = '2026-11-22'

describe('reports', () => {
  it('adds a report without mutating', () => {
    const p = emptyProgress(TODAY)
    const q = addReport(p, { id: 'u01-p01-hej', da: 'hej', en: 'hi' }, 'u01', 'wrong audio', TODAY, 'h1')
    expect(p.reports).toHaveLength(0)
    expect(q.reports[0]).toEqual({ itemId: 'u01-p01-hej', unitId: 'u01', da: 'hej', en: 'hi', note: 'wrong audio', day: TODAY, itemHash: 'h1' })
    expect(reportedIds(q).has('u01-p01-hej')).toBe(true)
  })

  it('text has da, note, recap ids, and current lesson', () => {
    let p = emptyProgress(TODAY)
    p = addReport(p, { id: 'u03-l07#q2', da: 'Jeg hedder Anna', en: 'My name is Anna' }, 'u03', 'typo here', TODAY, 'h')
    const t = reportsAsText(p, 'u03-l08')
    expect(t).toContain('u03-l07#q2 | u03 | Jeg hedder Anna | My name is Anna | typo here')
    expect(t.trim().split('\n').pop()).toBe('Current lesson: u03-l08')
  })

  it('names current lesson with no reports, and all done', () => {
    const p = emptyProgress(TODAY)
    expect(reportsAsText(p, 'u01-l01')).toBe('Current lesson: u01-l01')
    expect(reportsAsText(p, null)).toBe('Current lesson: all done')
  })
})
