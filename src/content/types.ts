export type Gender = 'en' | 'et'
export type ItemKind = 'word' | 'phrase' | 'pattern' | 'generated'
export type Generator =
  | { type: 'number'; min: number; max: number }
  | { type: 'time'; minutes: number[] } // minutes to draw from: multiples of 5 in 0-55
export interface Sentence {
  da: string
  en: string
  gap?: string // a whole word (or words) of da to blank out
}
export interface Item {
  id: string // u<NN>-p<PP>-<slug>
  kind: ItemKind
  da: string
  en: string // generated items: da/en are list labels only, never shown as answers
  alt?: { da?: string[]; en?: string[] }
  gender?: Gender // countable nouns: da starts with "en "/"et " matching gender
  forms?: string[] // nouns: plural, definite; verbs: tenses
  sentences?: Sentence[]
  note?: string
  say?: string // corrected spelling for the voice, only to fix a reported mispronunciation
  rev?: number // raised by the weekly update for every reported id it handles
  generator?: Generator // required iff kind === 'generated'
}
export interface RepeatLine {
  da: string
  en: string
  tip?: string // the book's pronunciation note
}
export interface RecapQuestion {
  prompt_en: string
  da: string
  accepted: string[] // includes da
  rev?: number
}
export interface Lesson {
  id: string // u<NN>-l<NN>
  title: string
  pages: number[]
  taughtInClass: boolean
  tip?: string
  items: Item[] // empty for recap lessons
  recapOf?: string[] // present => recap lesson: earlier item ids it reviews
  recapQuestions?: RecapQuestion[]
  context?: string[]
  repeatLines?: RepeatLine[]
}
export interface Unit {
  id: string
  order: number
  title: string
  subtitle: string
  pages: number[]
  lessons: Lesson[]
}
export interface Content {
  version: string // hash of all unit files, ignoring taughtInClass and rev
  units: Unit[]
  hashes: Record<string, string> // per item id and per recap question id (incl. rev)
}
