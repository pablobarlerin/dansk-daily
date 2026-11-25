// Usage: npm run audio [-- --dry-run]
// Reads AZURE_SPEECH_KEY / AZURE_SPEECH_REGION from process.env only. Never logs the key.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Unit } from '../src/content/types'
import { audioFileName, collectTexts, ssmlFor } from '../src/lib/audioTexts'

export const VOICE = 'da-DK-ChristelNeural'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const UNITS_DIR = join(ROOT, 'src/content/units')
const AUDIO_DIR = join(ROOT, 'public/audio')
const MANIFEST = join(ROOT, 'src/content/audio-manifest.json')

export async function synthesize(text: string, voice: string, key: string, region: string): Promise<Buffer> {
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`
  let lastErr = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          'User-Agent': 'dansk-daily-audio',
        },
        body: ssmlFor(text, voice),
      })
      if (res.ok) return Buffer.from(await res.arrayBuffer())
      lastErr = `HTTP ${res.status} ${res.statusText}`
      if (res.status >= 400 && res.status < 500 && res.status !== 429) break // retrying won't help
    } catch (e) {
      lastErr = `network error: ${e instanceof Error ? e.message.replaceAll(key, '***') : 'unknown'}`
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
  }
  throw new Error(`Azure request failed for "${text}": ${lastErr}`)
}

export function loadUnits(): Unit[] {
  return readdirSync(UNITS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(UNITS_DIR, f), 'utf8')) as Unit)
}

async function main() {
  const dry = process.argv.includes('--dry-run')
  const texts = collectTexts(loadUnits())
  const manifest: Record<string, string> = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {}
  const sameVoice = manifest['_voice'] === VOICE
  const todo = texts.filter(
    (t) => !sameVoice || manifest[t.key] !== audioFileName(t.spoken) || !existsSync(join(AUDIO_DIR, audioFileName(t.spoken))),
  )
  const chars = todo.reduce((n, t) => n + t.spoken.length, 0)
  console.log(`${texts.length} texts in total; ${todo.length} new/changed; ${chars} characters to synthesize`)
  if (dry) return

  const key = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION
  if (!key || !region) {
    console.error('Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION as environment variables (or use --dry-run).')
    process.exit(1)
  }
  mkdirSync(AUDIO_DIR, { recursive: true })
  const next: Record<string, string> = sameVoice ? { ...manifest } : {}
  next['_voice'] = VOICE
  let done = 0
  try {
    for (const t of todo) {
      const file = audioFileName(t.spoken)
      writeFileSync(join(AUDIO_DIR, file), await synthesize(t.spoken, VOICE, key, region))
      next[t.key] = file
      writeFileSync(MANIFEST, JSON.stringify(next, null, 2) + '\n') // so an interrupted run keeps its progress
      if (++done % 25 === 0) console.log(`${done}/${todo.length}`)
    }
  } catch (e) {
    console.error(`Stopped after ${done}/${todo.length} files; progress is saved, run again to continue.`)
    throw e
  }
  // drop entries and files nothing refers to
  const out: Record<string, string> = { _voice: VOICE }
  for (const t of texts) out[t.key] = next[t.key] ?? audioFileName(t.spoken)
  const used = new Set(Object.values(out))
  for (const f of readdirSync(AUDIO_DIR)) if (f.endsWith('.mp3') && !used.has(f)) unlinkSync(join(AUDIO_DIR, f))
  writeFileSync(MANIFEST, JSON.stringify(out, null, 2) + '\n')
  const bytes = readdirSync(AUDIO_DIR).reduce((n, f) => n + statSync(join(AUDIO_DIR, f)).size, 0)
  console.log(`Done: ${used.size} files, ${(bytes / 1024 / 1024).toFixed(1)} MB`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : 'failed')
    process.exit(1)
  })
}
