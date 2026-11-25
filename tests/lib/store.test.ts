import { describe, it, expect } from 'vitest'
import {
  emptyProgress, migrate, loadProgress, saveProgress, exportProgress, importProgress,
  reconcile, shouldNudgeBackup, STORAGE_KEY,
} from '../../src/lib/store'
import type { Content } from '../../src/content/types'

const TODAY = '2026-11-22'
function stub(): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k) },
    setItem: (k: string, v: string) => { m.set(k, v) },
  }
}
const wrap = (progress: unknown, app = 'dansk-daily') => JSON.stringify({ app, exportedAt: 'x', progress })

describe('store', () => {
  it('emptyProgress has defaults', () => {
    const p = emptyProgress(TODAY)
    expect(p.repeatsSeen).toEqual({})
    expect(p.firstUse).toBe(TODAY)
    expect(p.settings).toEqual({ audio: true, speed: 1.0, newPerDay: 10, backupNudge: true })
  })

  it('round trips through export/import', () => {
    const p = emptyProgress('2026-01-01')
    p.states['a'] = { strength: 3, due: '2026-02-01', lapses: 1, seen: 4, known: true }
    p.lessonsDone['u01-l01'] = true
    const now = new Date('2026-03-01T10:00:00Z')
    const r = importProgress(exportProgress(p, now), TODAY)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.progress).toEqual(p)
      expect(r.exportedAt).toBe(now.toISOString())
    }
  })

  it('refuses bad imports with readable errors', () => {
    for (const j of ['not json', '{"foo":1}', wrap(emptyProgress(TODAY), 'other'), 'null', '[]']) {
      const r = importProgress(j, TODAY)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.length).toBeGreaterThan(10)
    }
    const r = importProgress(wrap({ ...emptyProgress(TODAY), schemaVersion: 2 }), TODAY)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('newer version')
  })

  it('fills defaults for a sparse v1 file and repairs states', () => {
    const raw = {
      schemaVersion: 1,
      states: {
        hi: { strength: 9, due: '2026-05-01', lapses: 0, seen: 1, known: true },
        frac: { strength: 2.5, due: '2026-05-01', lapses: 0, seen: 1, known: true },
        neg: { strength: -1, due: '2026-05-01', lapses: 0, seen: 1, known: false },
        bad: { strength: 2, due: 'banana' },
        junk: 'nope',
        nul: null,
      },
      placement: { done: false, startUnitId: null },
      days: {}, reports: [], lessonsDone: {},
      settings: { audio: true, speed: 1, newPerDay: 10, backupNudge: true },
      lastBackupNudge: null, contentVersion: null,
    }
    const r = importProgress(wrap(raw), TODAY)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const p = r.progress
    expect(p.firstUse).toBe(TODAY)
    expect(p.repeatsSeen).toEqual({})
    expect(p.states.hi.strength).toBe(7)
    expect(p.states.frac.strength).toBe(2)
    expect(p.states.neg.strength).toBe(0)
    expect(p.states.bad.due).toBe(TODAY)
    expect(p.states.bad.lapses).toBe(0)
    expect(p.states.bad.seen).toBe(0)
    expect(p.states.bad.known).toBe(true)
    expect(p.states.junk).toBeUndefined()
    expect(p.states.nul).toBeUndefined()
  })

  it('migrate clamps settings and never throws on garbage', () => {
    const p = migrate({ schemaVersion: 1, settings: { speed: 5, newPerDay: 99, audio: 'x' }, reports: 'no', days: 7 }, TODAY)
    expect(p.settings.speed).toBe(1.2)
    expect(p.settings.newPerDay).toBe(20)
    expect(p.settings.audio).toBe(true)
    expect(p.reports).toEqual([])
    expect(p.days).toEqual({})
    expect(migrate(42, TODAY)).toEqual(emptyProgress(TODAY))
  })

  it('loadProgress handles missing and corrupt storage', () => {
    const s = stub()
    expect(loadProgress(s, TODAY)).toEqual(emptyProgress(TODAY))
    s.setItem(STORAGE_KEY, '{{{corrupt')
    expect(loadProgress(s, TODAY)).toEqual(emptyProgress(TODAY))
  })

  it('save then load returns the same progress', () => {
    const s = stub()
    const p = emptyProgress('2026-01-01')
    p.states['x'] = { strength: 1, due: '2026-01-02', lapses: 0, seen: 1, known: true }
    saveProgress(s, p)
    expect(loadProgress(s, TODAY)).toEqual(p)
  })

  describe('reconcile', () => {
    const rep = (id: string, hash: string) => ({ itemId: id, unitId: 'u01', da: 'd', en: 'e', note: 'n', day: TODAY, itemHash: hash })
    const content = (hashes: Record<string, string>): Content => ({ version: 'v2', units: [], hashes })

    it('keeps states, clears changed/removed reports', () => {
      const p = emptyProgress(TODAY)
      p.states['gone-id'] = { strength: 4, due: TODAY, lapses: 0, seen: 3, known: true }
      p.reports = [rep('A', 'h1'), rep('B', 'h2'), rep('Z', 'hz')]
      const out = reconcile(p, content({ A: 'h1-changed', B: 'h2' }))
      expect(out.states['gone-id']).toBeDefined()
      expect(out.reports.map(r => r.itemId)).toEqual(['B'])
      expect(out.contentVersion).toBe('v2')
      expect(p.reports).toHaveLength(3)
      expect(p.contentVersion).toBeNull()
    })

    it('clears a report when only that item hash (rev) changes', () => {
      const p = emptyProgress(TODAY)
      p.reports = [rep('A', 'h1'), rep('B', 'h2')]
      const out = reconcile(p, content({ A: 'h1', B: 'h2-rev2' }))
      expect(out.reports.map(r => r.itemId)).toEqual(['A'])
    })
  })

  describe('shouldNudgeBackup', () => {
    it('counts 30 days from lastBackupNudge', () => {
      const p = { ...emptyProgress('2026-01-01'), lastBackupNudge: '2026-01-01' }
      expect(shouldNudgeBackup(p, '2026-01-30')).toBe(false)
      expect(shouldNudgeBackup(p, '2026-01-31')).toBe(true)
      p.settings = { ...p.settings, backupNudge: false }
      expect(shouldNudgeBackup(p, '2026-06-01')).toBe(false)
    })
    it('falls back to firstUse', () => {
      const p = emptyProgress('2026-01-01')
      expect(shouldNudgeBackup(p, '2026-01-30')).toBe(false)
      expect(shouldNudgeBackup(p, '2026-01-31')).toBe(true)
    })
  })
})

describe('placed flag (optional, schema stays 1)', () => {
  it('migrate keeps placed: true and drops any other value', () => {
    const base = { strength: 2, due: '2026-05-01', lapses: 0, seen: 0, known: true }
    const p = migrate({ schemaVersion: 1, states: { a: { ...base, placed: true }, b: { ...base, placed: 'yes' }, c: base } }, TODAY)
    expect(p.schemaVersion).toBe(1)
    expect(p.states.a.placed).toBe(true)
    expect('placed' in p.states.b).toBe(false)
    expect('placed' in p.states.c).toBe(false)
  })
})
