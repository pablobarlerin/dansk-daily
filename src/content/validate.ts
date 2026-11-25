import type { Item, Lesson, Unit } from './types'

const UNIT_ID = /^u\d{2}$/
const LESSON_ID = /^u\d{2}-l\d{2}$/
const ITEM_ID = /^u\d{2}-p\d{2}-[a-z0-9æøå-]+$/

const words = (s: string): string[] =>
  s
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase())
    .filter(Boolean)

function containsWholeWords(da: string, gap: string): boolean {
  const d = words(da)
  const g = words(gap)
  if (g.length === 0) return false
  for (let i = 0; i + g.length <= d.length; i++) {
    if (g.every((w, j) => d[i + j] === w)) return true
  }
  return false
}

function checkItem(item: Item, errors: string[]): void {
  const at = `item ${item.id}`
  if (!ITEM_ID.test(item.id)) errors.push(`${at}: id must look like u<NN>-p<PP>-<slug>`)

  const generated = item.kind === 'generated'
  if (generated && !item.generator) errors.push(`${at}: generated item needs a generator`)
  if (!generated && item.generator) errors.push(`${at}: generator is only allowed on generated items`)
  if (generated && item.sentences) errors.push(`${at}: generated item must not have sentences`)

  const g = item.generator
  if (g?.type === 'time') {
    if (!Array.isArray(g.minutes) || g.minutes.length === 0) {
      errors.push(`${at}: time generator needs a non-empty minutes list`)
    } else {
      for (const m of g.minutes) {
        if (!Number.isInteger(m) || m < 0 || m > 55 || m % 5 !== 0) {
          errors.push(`${at}: time generator minute ${m} must be a multiple of 5 in 0-55`)
        }
      }
    }
  } else if (g?.type === 'number') {
    if (!(Number.isInteger(g.min) && Number.isInteger(g.max) && g.min <= g.max)) {
      errors.push(`${at}: number generator needs integer min <= max`)
    }
  }

  if (item.gender) {
    const art = `${item.gender} `
    if (!item.da.startsWith(art)) {
      errors.push(`${at}: noun "${item.da}" must start with the article "${art.trim()}" matching its gender`)
    }
    for (const alt of item.alt?.da ?? []) {
      if (!alt.startsWith(art)) {
        errors.push(`${at}: alt "${alt}" must start with the article "${art.trim()}"`)
      }
    }
  }

  for (const s of item.sentences ?? []) {
    if (s.gap !== undefined && !containsWholeWords(s.da, s.gap)) {
      errors.push(`${at}: gap "${s.gap}" is not a whole word of "${s.da}"`)
    }
  }
}

function checkLesson(unit: Unit, lesson: Lesson, seenBefore: Set<string>, errors: string[]): void {
  const at = `lesson ${lesson.id}`
  if (!LESSON_ID.test(lesson.id) || !lesson.id.startsWith(`${unit.id}-`)) {
    errors.push(`${at}: id must look like ${unit.id}-l<NN> (prefixed by its unit id)`)
  }
  if (typeof lesson.taughtInClass !== 'boolean') {
    errors.push(`${at}: taughtInClass is required and must be a boolean`)
  }

  const items = lesson.items ?? []
  if (lesson.recapOf) {
    if (items.length > 0) errors.push(`${at}: recap lesson must have no items`)
    if (!lesson.recapQuestions || lesson.recapQuestions.length === 0) {
      errors.push(`${at}: recap lesson needs recapQuestions`)
    }
    for (const id of lesson.recapOf) {
      if (!seenBefore.has(id)) errors.push(`${at}: recapOf "${id}" is unknown or not earlier than this recap`)
    }
    for (const [n, q] of (lesson.recapQuestions ?? []).entries()) {
      if (!q.accepted?.includes(q.da)) errors.push(`${at}#q${n}: recap accepted answers must include da "${q.da}"`)
    }
  } else {
    if (lesson.recapQuestions) errors.push(`${at}: recapQuestions only allowed on recap lessons (recapOf)`)
    if (items.length === 0 && (lesson.repeatLines?.length ?? 0) === 0) {
      errors.push(`${at}: lesson has no items and no repeatLines`)
    }
  }
}

export function validateContent(units: Unit[]): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  const noteId = (id: string) => {
    if (ids.has(id)) errors.push(`duplicate id ${id}`)
    ids.add(id)
  }

  const ordered = [...units].sort((a, b) => a.order - b.order)
  const seenItems = new Set<string>()

  for (const unit of ordered) {
    if (!UNIT_ID.test(unit.id)) errors.push(`unit ${unit.id}: id must look like u<NN>`)
    noteId(unit.id)

    let lastPage = -Infinity
    for (const lesson of unit.lessons) {
      noteId(lesson.id)
      checkLesson(unit, lesson, seenItems, errors)

      const first = lesson.pages?.[0]
      if (typeof first === 'number') {
        if (first < lastPage) {
          errors.push(`lesson ${lesson.id}: out of book-page order (page ${first} comes after page ${lastPage})`)
        }
        lastPage = Math.max(lastPage, first)
      }

      for (const item of lesson.items ?? []) {
        noteId(item.id)
        seenItems.add(item.id)
        checkItem(item, errors)
      }
    }
  }
  return errors
}
