import { describe, expect, it } from 'vitest'
import { normaliseForAudio } from '../../src/lib/audioTexts'
import { audioFileFor, canPlay, initAudio, pickDanishVoice } from '../../src/lib/audio'

const v = (lang: string) => ({ lang, name: lang }) as SpeechSynthesisVoice

describe('pickDanishVoice', () => {
  it('prefers da-DK', () => {
    expect(pickDanishVoice([v('en-US'), v('da-DK')])?.lang).toBe('da-DK')
  })
  it('returns null without Danish', () => {
    expect(pickDanishVoice([v('en-US')])).toBeNull()
  })
  it('accepts plain da', () => {
    expect(pickDanishVoice([v('da')])?.lang).toBe('da')
  })
})

describe('normaliseForAudio', () => {
  it('trims and collapses spaces', () => {
    expect(normaliseForAudio('  Jeg   hedder  Ellen ')).toBe('Jeg hedder Ellen')
  })
  it('applies NFC', () => {
    expect(normaliseForAudio('a\u030a')).toBe('\u00e5')
  })
})

describe('audioFileFor / canPlay', () => {
  const manifest = { 'Jeg hedder Ellen': 'a.mp3' }
  it('finds normalised keys', () => {
    expect(audioFileFor(' Jeg  hedder Ellen ', manifest)).toMatch(/audio\/a\.mp3$/)
    expect(audioFileFor('Hej', manifest)).toBeNull()
  })
  it('canPlay follows manifest or voice', () => {
    initAudio(manifest, false)
    expect(canPlay('Jeg hedder Ellen')).toBe(true)
    expect(canPlay('Hej')).toBe(false)
    initAudio({}, true)
    expect(canPlay('Hej')).toBe(true)
  })
})
