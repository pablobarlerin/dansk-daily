// Pure and Node-safe: no DOM, no import.meta.env, no node: imports (the browser bundles this file).
import type { Unit } from '../content/types'
import { numberToDanish } from './danishNumbers'
import { timeToDanish } from './danishTime'

export function normaliseForAudio(text: string): string {
  return text.normalize('NFC').trim().replace(/\s+/g, ' ')
}

// Corrected voice spellings for generated texts (numbers, times), keyed by normalised Danish.
export const SAY_OVERRIDES: Record<string, string> = {}

export function collectTexts(units: Unit[]): { key: string; spoken: string }[] {
  // key = the text the app plays: an item's say (if any) else its da. spoken = what the voice reads.
  const out = new Map<string, string>()
  const add = (da: string) => {
    const key = normaliseForAudio(da)
    if (key && !out.has(key)) out.set(key, SAY_OVERRIDES[key] ?? key)
  }
  for (const u of units) {
    for (const l of u.lessons) {
      for (const it of l.items) {
        if (it.kind !== 'generated') add(it.say ?? it.da)
        for (const s of it.sentences ?? []) add(s.da)
      }
      for (const r of l.repeatLines ?? []) add(r.da)
      for (const q of l.recapQuestions ?? []) add(q.da)
    }
  }
  for (let n = 0; n <= 100; n++) add(numberToDanish(n).primary)
  for (let h = 1; h <= 12; h++) for (let m = 0; m < 60; m += 5) add(timeToDanish(h, m).primary)
  return [...out].map(([key, spoken]) => ({ key, spoken }))
}

function sha1Hex(input: string): string {
  const bytes = new TextEncoder().encode(input)
  const len = bytes.length
  const padded = new Uint8Array((((len + 8) >> 6) + 1) << 6)
  padded.set(bytes)
  padded[len] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 4, (len * 8) >>> 0)
  view.setUint32(padded.length - 8, Math.floor((len * 8) / 2 ** 32))
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0
  const w = new Uint32Array(80)
  const rol = (x: number, n: number) => (x << n) | (x >>> (32 - n))
  for (let o = 0; o < padded.length; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(o + i * 4)
    for (let i = 16; i < 80; i++) w[i] = rol(w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!, 1)
    let a = h0, b = h1, c = h2, d = h3, e = h4
    for (let i = 0; i < 80; i++) {
      let f: number, k: number
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999 }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1 }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc }
      else { f = b ^ c ^ d; k = 0xca62c1d6 }
      const t = (rol(a, 5) + f + e + k + w[i]!) >>> 0
      e = d; d = c; c = rol(b, 30) >>> 0; b = a; a = t
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0
  }
  return [h0, h1, h2, h3, h4].map((x) => x.toString(16).padStart(8, '0')).join('')
}

export function audioFileName(spoken: string): string {
  return sha1Hex(normaliseForAudio(spoken)).slice(0, 12) + '.mp3'
}

const XML_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }

export function ssmlFor(text: string, voice: string): string {
  const esc = text.replace(/[&<>"']/g, (c) => XML_ESC[c]!)
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="da-DK"><voice name="${voice}">${esc}</voice></speak>`
}
