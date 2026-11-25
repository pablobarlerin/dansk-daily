// Shared UI test fixtures: a small 2-unit Content, a fixed clock and an in-memory Storage.
import { computeContent } from '../../src/content/load'
import type { Content, Item, Lesson, Unit } from '../../src/content/types'
import type { Progress } from '../../src/lib/progressTypes'
import { emptyProgress, STORAGE_KEY } from '../../src/lib/store'

export const TODAY = '2026-11-25'
/** Noon local time on TODAY. */
export const fixedNow = () => new Date(2026, 10, 25, 12, 0, 0)

const word = (id: string, da: string, en: string, extra: Partial<Item> = {}): Item => ({
  id, kind: 'word', da, en, ...extra,
})

const lesson = (id: string, title: string, pages: number[], items: Item[], extra: Partial<Lesson> = {}): Lesson => ({
  id, title, pages, taughtInClass: true, items, ...extra,
})

export const fixtureUnits: Unit[] = [
  {
    id: 'u01',
    order: 1,
    title: 'Præsentation 1',
    subtitle: 'Hej og navne',
    pages: [9, 10],
    lessons: [
      lesson('u01-l01', 'Hej', [9], [
        word('u01-p09-hej', 'hej', 'hello'),
        word('u01-p09-farvel', 'farvel', 'goodbye'),
        word('u01-p09-bil', 'en bil', 'a car', { gender: 'en', sentences: [{ da: 'Jeg har en bil.', en: 'I have a car.', gap: 'bil' }] }),
      ], { repeatLines: [{ da: 'Hvad hedder du?', en: "What's your name?" }] }),
      lesson('u01-l02', 'Navne', [10], [
        word('u01-p10-hus', 'et hus', 'a house', { gender: 'et' }),
        word('u01-p10-ja', 'ja', 'yes'),
      ]),
    ],
  },
  {
    id: 'u02',
    order: 2,
    title: 'I klassen 1',
    subtitle: 'I klassen',
    pages: [11, 12],
    lessons: [
      lesson('u02-l01', 'Klassen', [11], [
        word('u02-p11-bog', 'en bog', 'a book', { gender: 'en' }),
        word('u02-p11-tavle', 'en tavle', 'a board', { gender: 'en' }),
      ]),
      lesson('u02-l02', 'Repetition', [12], [], { recapOf: ['u01-p09-hej', 'u02-p11-bog'] }),
    ],
  },
]

export function fixtureContent(): Content {
  return computeContent(fixtureUnits)
}

/** Minimal in-memory Storage. `failSet` makes setItem throw like a full or private-mode iPhone. */
export function memoryStorage(init: Record<string, string> = {}, opts: { failSet?: boolean } = {}): Storage & { data: Map<string, string> } {
  const data = new Map(Object.entries(init))
  return {
    data,
    get length() { return data.size },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => { data.delete(k) },
    setItem: (k: string, v: string) => {
      if (opts.failSet) throw new DOMException('Quota exceeded', 'QuotaExceededError')
      data.set(k, String(v))
    },
  }
}

/** A Progress that has finished placement (start from unit 1), for Home tests. */
export function placedProgress(extra: Partial<Progress> = {}): Progress {
  return { ...emptyProgress(TODAY), placement: { done: true, startUnitId: null }, ...extra }
}

export function storageWith(p: Progress): ReturnType<typeof memoryStorage> {
  return memoryStorage({ [STORAGE_KEY]: JSON.stringify(p) })
}

export function stored(s: Storage): Progress {
  return JSON.parse(s.getItem(STORAGE_KEY)!) as Progress
}
