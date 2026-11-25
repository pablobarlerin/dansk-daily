const DAY_MS = 86400000

function parse(day: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) throw new Error(`Invalid day: ${day}`)
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function format(ms: number): string {
  const d = new Date(ms)
  const y = String(d.getUTCFullYear()).padStart(4, '0')
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const da = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}

export function addDays(day: string, n: number): string {
  return format(parse(day) + n * DAY_MS)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b) - parse(a)) / DAY_MS)
}

export function localDay(d: Date): string {
  const y = String(d.getFullYear()).padStart(4, '0')
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}
