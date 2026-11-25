import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, localDay } from '../../src/lib/dates'

describe('dates', () => {
  it('adds days across year end', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-05-05', 0)).toBe('2026-05-05')
    expect(addDays('2026-01-01', 120)).toBe('2026-05-01')
  })
  it('daysBetween is DST-proof', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
    expect(daysBetween('2026-05-05', '2026-05-01')).toBe(-4)
  })
  it('localDay formats local date parts', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(localDay(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31')
  })
})
