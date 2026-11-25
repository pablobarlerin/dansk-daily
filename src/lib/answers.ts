import type { Gender } from '../content/types'

export type Verdict = 'correct' | 'almost' | 'wrong'

export function normaliseAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/["]/g, '')
    .replace(/[.,!?;:]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const foldFull = (s: string): string => s.replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
const foldShort = (s: string): string =>
  s
    .replace(/[æå]/g, 'a')
    .replace(/ø/g, 'o')
    .replace(/ae|aa/g, 'a')
    .replace(/oe/g, 'o')

const foldsMatch = (a: string, b: string): boolean =>
  foldFull(a) === foldFull(b) || foldShort(a) === foldShort(b)

function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (i === a.length && i === b.length) return true
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1)
  if (a.length > b.length) return a.slice(i + 1) === b.slice(i)
  return a.slice(i) === b.slice(i + 1)
}

export function checkAnswer(
  input: string,
  accepted: string[],
  opts: { gender?: Gender; sentence?: boolean } = {},
): { verdict: Verdict; expected: string; hint?: 'missing-article' | 'wrong-article' } {
  const first = accepted[0] ?? ''
  const answer = normaliseAnswer(input)
  if (answer === '') return { verdict: 'wrong', expected: first }
  const norm = accepted.map(normaliseAnswer)

  const exact = norm.indexOf(answer)
  if (exact >= 0) return { verdict: 'correct', expected: accepted[exact] }

  const folded = norm.findIndex((n) => foldsMatch(answer, n))
  if (folded >= 0) return { verdict: 'almost', expected: accepted[folded] }

  if (opts.sentence) {
    const near = norm.findIndex((n) => withinOneEdit(answer, n))
    if (near >= 0) return { verdict: 'almost', expected: accepted[near] }
  }

  if (opts.gender) {
    const own = opts.gender
    const other = own === 'en' ? 'et' : 'en'
    for (let i = 0; i < norm.length; i++) {
      if (!norm[i].startsWith(own + ' ')) continue
      const bare = norm[i].slice(own.length + 1)
      if (foldsMatch(answer, bare)) return { verdict: 'wrong', expected: accepted[i], hint: 'missing-article' }
      if (answer.startsWith(other + ' ') && foldsMatch(answer.slice(other.length + 1), bare)) {
        return { verdict: 'wrong', expected: accepted[i], hint: 'wrong-article' }
      }
    }
  }

  return { verdict: 'wrong', expected: first }
}
