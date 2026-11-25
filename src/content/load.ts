import type { Content, Unit } from './types'

// Vite resolves globs relative to this file.
const modules = import.meta.glob<{ default: Unit }>('./units/*.json', { eager: true })

/** FNV-1a (32-bit) over a string, hex. Small, synchronous, stable. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

// Version ignores taughtInClass and rev so flipping them never triggers "New lesson added".
const stripVolatile = (_key: string, value: unknown): unknown => {
  if (_key === 'taughtInClass' || _key === 'rev') return undefined
  return value
}

export function computeContent(units: Unit[]): Content {
  const sorted = [...units].sort((a, b) => a.order - b.order)
  const hashes: Record<string, string> = {}
  for (const unit of sorted) {
    for (const lesson of unit.lessons) {
      for (const item of lesson.items ?? []) hashes[item.id] = fnv1a(JSON.stringify(item))
      for (const [n, q] of (lesson.recapQuestions ?? []).entries()) {
        hashes[`${lesson.id}#q${n}`] = fnv1a(JSON.stringify(q))
      }
    }
  }
  return { version: fnv1a(JSON.stringify(sorted, stripVolatile)), units: sorted, hashes }
}

export function loadContent(): Content {
  const units = Object.values(modules).map((m) => (m.default ?? m) as Unit)
  return computeContent(units)
}
