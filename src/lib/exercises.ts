import type { Gender, Item, Sentence } from '../content/types'
import type { Level } from './srs'
import type { Rng } from './rng'
import { normaliseAnswer } from './answers'
import { numberToDanish } from './danishNumbers'
import { timeToDanish, timeToDigits } from './danishTime'

export type ExerciseKind =
  | 'mc-da-en' | 'mc-en-da' | 'match' | 'listen-pick' // recognise
  | 'gap-options' | 'tiles' | 'pick-article' // assemble
  | 'type-da' | 'listen-type' | 'type-gap' // produce

export interface Exercise {
  kind: ExerciseKind
  itemIds: string[] // 'match': 4-5 ids; others: 1
  prompt: string
  speak?: string
  options?: string[]
  tiles?: string[]
  pairs?: { da: string; en: string }[]
  accepted: string[]
  gender?: Gender
  sentence?: boolean
  shown?: { da: string; en: string }
}

interface Opts {
  canPlay: (da: string) => boolean
  lastKind?: ExerciseKind
}

// ---------- small helpers ----------

function shuffle<T>(xs: T[], rng: Rng): T[] {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const unitOf = (id: string): string => id.split('-')[0]
const hasArticle = (s: string): boolean => /^(en|et)\s/i.test(s)
const stripArticle = (s: string): string => s.replace(/^(en|et)\s+/i, '')
const lc = (s: string): string => s.toLowerCase()
const distinct = (xs: string[]): string[] => {
  const seen = new Set<string>()
  return xs.filter((x) => (seen.has(lc(x)) ? false : (seen.add(lc(x)), true)))
}

/** Non-generated, non-identical pool items; same unit first, each group shuffled. */
function candidates(item: Item, pool: Item[], rng: Rng): Item[] {
  const ok = pool.filter((p) => p.id !== item.id && p.kind !== 'generated' && p.da !== item.da)
  const u = unitOf(item.id)
  return [...shuffle(ok.filter((p) => unitOf(p.id) === u), rng), ...shuffle(ok.filter((p) => unitOf(p.id) !== u), rng)]
}

const answersFor = (item: Item): string[] => [item.da, ...(item.alt?.da ?? [])]
const speakText = (item: Item): string => item.say ?? item.da
const stripPunct = (w: string): string => w.replace(/[.,!?;:]/g, '')
const wordsOf = (s: string): string[] => s.split(/\s+/).map(stripPunct).filter((w) => w !== '')

/** Blank the first whole-word occurrence of the gap; null if it is not found. */
function blank(s: Sentence): string | null {
  if (!s.gap) return null
  const gapWords = s.gap.split(/\s+/).map(normaliseAnswer)
  const tokens = s.da.split(/\s+/)
  const norm = tokens.map(normaliseAnswer)
  for (let i = 0; i + gapWords.length <= tokens.length; i++) {
    if (!gapWords.every((g, j) => g === norm[i + j])) continue
    const last = i + gapWords.length - 1
    const lead = tokens[i].match(/^[^\p{L}\p{N}]*/u)![0]
    const trail = tokens[last].match(/[^\p{L}\p{N}]*$/u)![0]
    return [...tokens.slice(0, i), `${lead}___${trail}`, ...tokens.slice(last + 1)].join(' ')
  }
  return null
}

const gapSentences = (item: Item): Sentence[] => (item.sentences ?? []).filter((s) => blank(s) !== null)

// ---------- generated items ----------

interface Drawn { primary: string; accepted: string[]; digits: string }

function draw(item: Item, rng: Rng): Drawn {
  const g = item.generator!
  if (g.type === 'number') {
    const v = g.min + Math.floor(rng() * (g.max - g.min + 1))
    const d = numberToDanish(v)
    return { primary: d.primary, accepted: d.accepted, digits: String(v) }
  }
  const h = 1 + Math.floor(rng() * 12)
  const m = g.minutes[Math.floor(rng() * g.minutes.length)]
  const d = timeToDanish(h, m)
  return { primary: d.primary, accepted: d.accepted, digits: timeToDigits(h, m) }
}

function drawOthers(item: Item, rng: Rng, taken: string[], n: number): Drawn[] {
  const out: Drawn[] = []
  const seen = new Set(taken)
  for (let tries = 0; tries < 60 && out.length < n; tries++) {
    const d = draw(item, rng)
    if (seen.has(d.primary)) continue
    seen.add(d.primary)
    out.push(d)
  }
  return out
}

function makeGenerated(item: Item, level: Level, rng: Rng): Exercise {
  const v = draw(item, rng)
  const base = { itemIds: [item.id], shown: { da: v.primary, en: v.digits } }
  if (level === 'recognise') {
    const others = drawOthers(item, rng, [v.primary], 3)
    return {
      ...base,
      kind: 'mc-en-da',
      prompt: `How do you say "${v.digits}" in Danish?`,
      options: shuffle([v.primary, ...others.map((o) => o.primary)], rng),
      accepted: [v.primary],
    }
  }
  if (level === 'assemble') {
    const correct = v.primary.split(/\s+/)
    const pool = distinct(drawOthers(item, rng, [v.primary], 6).flatMap((o) => o.primary.split(/\s+/)))
    const extra = shuffle(pool.filter((w) => !correct.some((c) => lc(c) === lc(w))), rng).slice(0, 2)
    return {
      ...base,
      kind: 'tiles',
      prompt: `Build "${v.digits}" in Danish`,
      tiles: shuffle([...correct, ...extra], rng),
      accepted: [correct.join(' ')],
    }
  }
  return { ...base, kind: 'type-da', prompt: `Type in Danish: ${v.digits}`, accepted: v.accepted }
}

// ---------- recognise ----------

function mcOptions(answer: string, others: string[], rng: Rng): string[] {
  const rest = distinct(others).filter((o) => lc(o) !== lc(answer)).slice(0, 3)
  return shuffle([answer, ...rest], rng)
}

function mc(item: Item, pool: Item[], rng: Rng, kind: 'mc-da-en' | 'mc-en-da'): Exercise {
  const cs = candidates(item, pool, rng)
  const daToEn = kind === 'mc-da-en'
  const answer = daToEn ? item.en : item.da
  return {
    kind,
    itemIds: [item.id],
    prompt: daToEn ? `What does "${item.da}" mean?` : `How do you say "${item.en}" in Danish?`,
    options: mcOptions(answer, cs.map((c) => (daToEn ? c.en : c.da)), rng),
    accepted: [answer],
  }
}

function match(item: Item, pool: Item[], rng: Rng): Exercise | null {
  if (item.kind === 'generated') return null
  const fillers: Item[] = []
  for (const c of candidates(item, pool, rng)) {
    const all = [item, ...fillers]
    if (all.some((x) => lc(x.da) === lc(c.da) || lc(x.en) === lc(c.en))) continue
    fillers.push(c)
  }
  const want = rng() < 0.5 ? 3 : 4
  if (fillers.length < 3) return null
  const chosen = [item, ...fillers.slice(0, want)]
  return {
    kind: 'match',
    itemIds: chosen.map((c) => c.id),
    prompt: 'Match the Danish with the English',
    pairs: chosen.map((c) => ({ da: c.da, en: c.en })),
    accepted: [],
  }
}

/** Pick what a listening exercise plays: the item or one of its (playable) sentences, about half each. */
function chooseListen(
  item: Item, rng: Rng, opts: Opts, sentenceOk: (s: Sentence) => boolean,
): { text: string; sentence?: Sentence } | null {
  const sents = (item.sentences ?? []).filter((s) => opts.canPlay(s.da) && sentenceOk(s))
  const itemOk = opts.canPlay(speakText(item))
  const wantSentence = sents.length > 0 && rng() < 0.5
  if ((wantSentence || !itemOk) && sents.length > 0) {
    const s = sents[Math.floor(rng() * sents.length)]
    return { text: s.da, sentence: s }
  }
  return itemOk ? { text: speakText(item) } : null
}

function listenPick(item: Item, pool: Item[], rng: Rng, opts: Opts): Exercise | null {
  if (item.kind === 'generated') return null
  const cs = candidates(item, pool, rng)
  const sentenceOptions = (s: Sentence): string[] | null => {
    const others = cs
      .map((c) => (c.sentences?.length ? c.sentences[Math.floor(rng() * c.sentences.length)].en : null))
      .filter((x): x is string => x !== null)
    const rest = distinct(others).filter((o) => lc(o) !== lc(s.en))
    return rest.length >= 3 ? mcOptions(s.en, rest, rng) : null
  }
  const pre = cs.filter((c) => c.sentences?.length).length >= 3
  const pick = chooseListen(item, rng, opts, () => pre)
  if (!pick) return null
  if (pick.sentence) {
    const options = sentenceOptions(pick.sentence)
    if (options) {
      return {
        kind: 'listen-pick', itemIds: [item.id], prompt: 'Listen and pick the English', speak: pick.text,
        options, accepted: [pick.sentence.en],
      }
    }
    if (!opts.canPlay(speakText(item))) return null
  }
  return {
    kind: 'listen-pick', itemIds: [item.id], prompt: 'Listen and pick the meaning', speak: speakText(item),
    options: mcOptions(item.en, cs.map((c) => c.en), rng), accepted: [item.en],
  }
}

// ---------- assemble ----------

function gapOptions(item: Item, pool: Item[], rng: Rng): Exercise | null {
  const sents = gapSentences(item)
  if (sents.length === 0) return null
  const s = sents[Math.floor(rng() * sents.length)]
  const gap = s.gap!
  const gapN = gap.split(/\s+/).length
  const raw = candidates(item, pool, rng).map((c) => (hasArticle(gap) ? c.da : stripArticle(c.da)))
  const shaped = [...raw.filter((o) => o.split(/\s+/).length === gapN), ...raw.filter((o) => o.split(/\s+/).length !== gapN)]
  return {
    kind: 'gap-options',
    itemIds: [item.id],
    prompt: `${blank(s)}\n${s.en}`,
    options: mcOptions(gap, shaped, rng),
    accepted: [gap],
  }
}

function tiles(item: Item, pool: Item[], rng: Rng): Exercise | null {
  const sents = item.sentences ?? []
  if (sents.length === 0) return null
  const s = sents[Math.floor(rng() * sents.length)]
  const correct = wordsOf(s.da)
  if (correct.length === 0) return null
  const words = distinct(
    candidates(item, pool, rng).flatMap((c) => [...wordsOf(c.da), ...(c.sentences ?? []).flatMap((x) => wordsOf(x.da))]),
  ).filter((w) => !/^(en|et)$/i.test(w) && !correct.some((c) => lc(c) === lc(w)))
  const extra = shuffle(words, rng).slice(0, 2)
  return {
    kind: 'tiles',
    itemIds: [item.id],
    prompt: `Build the sentence: ${s.en}`,
    tiles: shuffle([...correct, ...extra], rng),
    accepted: [correct.join(' ')],
  }
}

function pickArticle(item: Item): Exercise | null {
  if (!item.gender || !hasArticle(item.da)) return null
  return {
    kind: 'pick-article',
    itemIds: [item.id],
    prompt: `Which article? ___ ${stripArticle(item.da)} (${item.en})`,
    options: ['en', 'et'],
    accepted: [item.gender],
  }
}

// ---------- produce ----------

function typeDa(item: Item): Exercise {
  return {
    kind: 'type-da',
    itemIds: [item.id],
    prompt: `Type in Danish: ${item.en}`,
    accepted: answersFor(item),
    ...(item.gender ? { gender: item.gender } : {}),
  }
}

function listenType(item: Item, rng: Rng, opts: Opts): Exercise | null {
  const pick = chooseListen(item, rng, opts, () => true)
  if (!pick) return null
  if (pick.sentence) {
    return { kind: 'listen-type', itemIds: [item.id], prompt: 'Type what you hear', speak: pick.text, accepted: [pick.sentence.da], sentence: true }
  }
  return {
    kind: 'listen-type', itemIds: [item.id], prompt: 'Type what you hear', speak: pick.text,
    accepted: answersFor(item), ...(item.gender ? { gender: item.gender } : {}),
  }
}

function typeGap(item: Item, rng: Rng): Exercise | null {
  const sents = gapSentences(item)
  if (sents.length === 0) return null
  const s = sents[Math.floor(rng() * sents.length)]
  return { kind: 'type-gap', itemIds: [item.id], prompt: `Fill the gap: ${blank(s)}\n${s.en}`, accepted: [s.gap!] }
}

// ---------- entry point ----------

export function makeExercise(item: Item, level: Level, pool: Item[], rng: Rng, opts: Opts): Exercise {
  if (item.kind === 'generated' && item.generator) return makeGenerated(item, level, rng)

  const build = (kind: ExerciseKind): Exercise | null => {
    switch (kind) {
      case 'mc-da-en': case 'mc-en-da': return mc(item, pool, rng, kind)
      case 'match': return match(item, pool, rng)
      case 'listen-pick': return listenPick(item, pool, rng, opts)
      case 'gap-options': return gapOptions(item, pool, rng)
      case 'tiles': return tiles(item, pool, rng)
      case 'pick-article': return pickArticle(item)
      case 'type-da': return typeDa(item)
      case 'listen-type': return listenType(item, rng, opts)
      case 'type-gap': return typeGap(item, rng)
    }
  }

  let order: ExerciseKind[]
  if (level === 'recognise') {
    order = shuffle<ExerciseKind>(['mc-da-en', 'mc-en-da', 'match', 'listen-pick'], rng)
  } else if (level === 'assemble') {
    order = [...shuffle<ExerciseKind>(['gap-options', 'tiles', 'pick-article'], rng), ...shuffle<ExerciseKind>(['mc-da-en', 'mc-en-da'], rng)]
  } else {
    const main = shuffle<ExerciseKind>(['type-da', 'listen-type'], rng)
    order = gapSentences(item).length > 0 && rng() < 1 / 3 ? ['type-gap', ...main] : [...main, 'type-gap']
  }
  if (opts.lastKind) order = [...order.filter((k) => k !== opts.lastKind), ...order.filter((k) => k === opts.lastKind)]

  for (const kind of order) {
    const ex = build(kind)
    if (ex) return ex
  }
  return typeDa(item)
}
