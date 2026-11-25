import { describe, expect, it } from 'vitest'
import { SAY_OVERRIDES, audioFileName, collectTexts, ssmlFor } from '../../src/lib/audioTexts'
import type { Item, Unit } from '../../src/content/types'

const item = (o: Partial<Item> & { da: string }): Item => ({ id: 'u01-p01-x', kind: 'phrase', en: 'EN-ONLY', ...o })
const unit = (items: Item[], extra: Partial<Unit['lessons'][number]> = {}): Unit => ({
  id: 'u01', order: 1, title: 't', subtitle: 's', pages: [1],
  lessons: [{ id: 'u01-l01', title: 'l', pages: [1], taughtInClass: true, items, ...extra }],
})

describe('collectTexts', () => {
  it('de-duplicates by key', () => {
    const t = collectTexts([unit([item({ da: 'en bil' }), item({ da: ' en  bil ' })])])
    expect(t.filter((x) => x.key === 'en bil')).toHaveLength(1)
  })
  it('includes sentences, repeat lines, recap questions, numbers and times', () => {
    const u = unit([item({ da: 'a', sentences: [{ da: 'Jeg har en bil.', en: 'x' }] })], {
      repeatLines: [{ da: 'Gentag mig', en: 'x' }],
      recapQuestions: [{ prompt_en: 'x', da: 'Hvad hedder du?', accepted: ['Hvad hedder du?', 'Hvad er dit navn?'] }],
    })
    const keys = collectTexts([u]).map((x) => x.key)
    for (const k of ['Jeg har en bil.', 'Gentag mig', 'Hvad hedder du?', 'enogtyve', 'halv fire', 'nul', 'et hundrede']) {
      expect(keys).toContain(k)
    }
  })
  it('never includes English or generated labels', () => {
    const keys = collectTexts([
      unit([
        item({ da: 'hej' }),
        item({ da: 'Tal-label', kind: 'generated', generator: { type: 'number', min: 0, max: 9 } }),
      ]),
    ]).map((x) => x.key)
    expect(keys).not.toContain('EN-ONLY')
    expect(keys).not.toContain('Tal-label')
    expect(keys).toContain('hej')
  })
  it('an item with say is keyed by the say text; the plain entry stays', () => {
    const t = collectTexts([unit([item({ da: 'en bil' }), item({ da: 'en bil', say: 'en biil' })])])
    expect(t).toContainEqual({ key: 'en biil', spoken: 'en biil' })
    expect(t).toContainEqual({ key: 'en bil', spoken: 'en bil' })
  })
  it('SAY_OVERRIDES changes spoken for a number', () => {
    SAY_OVERRIDES['enogtyve'] = 'en og tyve'
    try {
      expect(collectTexts([]).find((x) => x.key === 'enogtyve')?.spoken).toBe('en og tyve')
    } finally {
      delete SAY_OVERRIDES['enogtyve']
    }
  })
})

describe('audioFileName', () => {
  it('is stable, distinct and mp3', () => {
    expect(audioFileName('hej')).toBe(audioFileName(' hej '))
    expect(audioFileName('hej')).not.toBe(audioFileName('hej hej'))
    expect(audioFileName('hej')).toMatch(/^[0-9a-f]{12}\.mp3$/)
  })
})

describe('ssmlFor', () => {
  it('escapes special characters', () => {
    const s = ssmlFor(`R&B <"'>`, 'da-DK-ChristelNeural')
    expect(s).toContain('R&amp;B &lt;&quot;&apos;&gt;')
    expect(s).toContain('da-DK-ChristelNeural')
  })
})

describe('audioFileName known value', () => {
  it('matches SHA-1 (first 12 hex)', async () => {
    const { createHash } = await import('node:crypto')
    for (const s of ['hej', 'halvfjerds', 'Hvad hedder du?', 'æøå'.repeat(40)]) {
      expect(audioFileName(s)).toBe(createHash('sha1').update(s.normalize('NFC')).digest('hex').slice(0, 12) + '.mp3')
    }
  })
})
