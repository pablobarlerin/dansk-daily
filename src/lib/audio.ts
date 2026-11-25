import { normaliseForAudio } from './audioTexts'

const BASE_URL: string = import.meta.env?.BASE_URL ?? '/'
const MAX_PREPARED = 20

let manifest: Record<string, string> = {}
let hasVoice = false

const prepared = new Map<string, { audio: HTMLAudioElement; url: string }>()
const inFlight = new Set<string>()

export function initAudio(m: Record<string, string>, voice: boolean): void {
  manifest = m
  hasVoice = voice
}

export function audioFileFor(text: string, m: Record<string, string>): string | null {
  const file = m[normaliseForAudio(text)]
  return file ? `${BASE_URL}audio/${file}` : null
}

export function pickDanishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  return (
    voices.find((v) => v.lang === 'da-DK') ??
    voices.find((v) => v.lang.toLowerCase().startsWith('da')) ??
    null
  )
}

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null
}

export function speechAvailable(): Promise<boolean> {
  const s = synth()
  if (!s) return Promise.resolve(false)
  if (pickDanishVoice(s.getVoices())) return Promise.resolve(true)
  return new Promise((resolve) => {
    const done = () => {
      s.removeEventListener?.('voiceschanged', done)
      clearTimeout(timer)
      resolve(pickDanishVoice(s.getVoices()) !== null)
    }
    const timer = setTimeout(done, 1500)
    s.addEventListener?.('voiceschanged', done)
  })
}

export function canPlay(text: string): boolean {
  return audioFileFor(text, manifest) !== null || hasVoice
}

export function prepare(text: string): void {
  const key = normaliseForAudio(text)
  const url = audioFileFor(key, manifest)
  if (!url || prepared.has(key) || inFlight.has(key)) return
  if (typeof fetch !== 'function' || typeof Audio === 'undefined') return
  inFlight.add(key)
  fetch(url)
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob)
      const audio = new Audio(objectUrl)
      audio.preload = 'auto'
      audio.load()
      prepared.set(key, { audio, url: objectUrl })
      while (prepared.size > MAX_PREPARED) {
        const oldest = prepared.keys().next().value as string
        const entry = prepared.get(oldest)
        if (entry) URL.revokeObjectURL(entry.url)
        prepared.delete(oldest)
      }
    })
    .catch(() => {})
    .finally(() => inFlight.delete(key))
}

export function play(text: string, opts: { speed: number; slow?: boolean }): void {
  const key = normaliseForAudio(text)
  const factor = opts.slow ? 0.7 : 1
  const entry = prepared.get(key)
  if (entry) {
    const a = entry.audio as HTMLAudioElement & { webkitPreservesPitch?: boolean }
    a.playbackRate = opts.speed * factor
    a.preservesPitch = true
    if ('webkitPreservesPitch' in a) a.webkitPreservesPitch = true
    a.currentTime = 0
    void a.play()?.catch?.(() => {})
    return
  }
  const s = synth()
  if (!s || typeof SpeechSynthesisUtterance === 'undefined') return
  const voice = pickDanishVoice(s.getVoices())
  if (!voice && !hasVoice) return
  s.cancel()
  const u = new SpeechSynthesisUtterance(key)
  if (voice) u.voice = voice
  u.lang = 'da-DK'
  u.rate = opts.speed * 0.9 * factor
  s.speak(u)
}

export async function downloadAllAudio(
  m: Record<string, string>,
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  const files = Object.entries(m)
    .filter(([k]) => !k.startsWith('_'))
    .map(([, f]) => `${BASE_URL}audio/${f}`)
  const total = files.length
  onProgress(0, total)
  if (typeof caches === 'undefined' || typeof fetch !== 'function') return
  try {
    const cache = await caches.open('audio')
    let done = 0
    let next = 0
    const worker = async () => {
      while (next < files.length) {
        const url = files[next++]
        try {
          if (!(await cache.match(url))) {
            const r = await fetch(url)
            if (r.ok) await cache.put(url, r)
          }
        } catch {
          // skipped; retried on next start
        }
        done++
        onProgress(done, total)
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, total) }, worker))
  } catch {
    // never throw
  }
}
