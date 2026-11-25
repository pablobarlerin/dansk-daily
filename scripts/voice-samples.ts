// Usage: npm run audio:samples  — writes .work/voice-samples/ (voice comparison + risky-text check). Not committed output.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { numberToDanish } from '../src/lib/danishNumbers'
import { timeToDanish } from '../src/lib/danishTime'
import { synthesize } from './generate-audio'

const num = (n: number): [string, string, string] => [numberToDanish(n).primary, numberToDanish(n).primary, String(n)]
const time = (h: number, m: number, en: string): [string, string, string] => {
  const p = timeToDanish(h, m).primary
  return [p.replaceAll(' ', '-'), p, en]
}

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '.work', 'voice-samples')
const SAMPLES = ['Hej, jeg hedder Maria.', 'Hvad hedder din gade?', 'Jeg bor sammen med Peter.']
const RISKY: [string, string, string][] = [
  ['mad', 'mad', 'food'],
  ['hedder', 'hedder', 'is called'],
  ['gade', 'en gade', 'a street'],
  ['hvad-med-dig', 'Hvad med dig?', 'What about you?'],
  ['og', 'og', 'and'],
  ['ikke', 'ikke', 'not'],
  ['lidt', 'lidt', 'a little'],
  ['vejr', 'vejr', 'weather'],
  ['bo', 'bo', 'to live'],
  ['hade', 'hade', 'to hate'],
  ['moede', 'møde', 'meeting'],
  num(21), num(50), num(53), num(70), num(80),
  time(3, 30, 'half past three'),
  time(2, 45, 'quarter to three'),
  time(10, 20, 'twenty past ten'),
  ['jeg-bor-sammen-med-peter', 'Jeg bor sammen med Peter.', 'I live with Peter.'],
]

async function main() {
  const key = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION
  if (!key || !region) throw new Error('Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.')
  const check = join(OUT, 'check')
  mkdirSync(check, { recursive: true })
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',').map(Number) // e.g. --only=18 re-makes just those checks
  for (const [voice, name] of [['da-DK-ChristelNeural', 'christel'], ['da-DK-JeppeNeural', 'jeppe']] as const)
    for (const [i, t] of SAMPLES.entries()) if (!only)
      writeFileSync(join(OUT, `${name}-${i + 1}.mp3`), await synthesize(t, voice, key, region))
  const rows = ['| # | Danish | English | File |', '|---|---|---|---|']
  for (const [i, [slug, da, en]] of RISKY.entries()) {
    const file = `${String(i + 1).padStart(2, '0')}-${slug}.mp3`
    if (!only || only.includes(i + 1)) writeFileSync(join(check, file), await synthesize(da, 'da-DK-ChristelNeural', key, region))
    rows.push(`| ${i + 1} | ${da} | ${en} | ${file} |`)
  }
  writeFileSync(join(check, 'LIST.md'), '# Risky-text check (Christel)\n\n' + rows.join('\n') + '\n')
  console.log('samples written to .work/voice-samples')
}
main().catch((e) => { console.error(e instanceof Error ? e.message : 'failed'); process.exit(1) })
