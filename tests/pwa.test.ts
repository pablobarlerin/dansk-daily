import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dist = 'dist'
const read = (f: string) => readFileSync(`${dist}/${f}`, 'utf8')

describe('PWA build output (run after npm run build)', () => {
  it('has a standalone manifest named Dansk Daily', () => {
    const m = JSON.parse(read('manifest.webmanifest'))
    expect(m.display).toBe('standalone')
    expect(m.name).toBe('Dansk Daily')
    expect(m.short_name).toBe('Dansk Daily')
    expect(m.start_url).toBe('/dansk-daily/')
    expect(m.scope).toBe('/dansk-daily/')
    expect(m.theme_color).toBe('#c8102e')
    expect(m.background_color).toBe('#ffffff')
    expect(m.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true)
  })

  it('has a service worker that precaches every asset js and no mp3', () => {
    expect(existsSync(`${dist}/sw.js`)).toBe(true)
    const sw = read('sw.js')
    const js = readdirSync(`${dist}/assets`).filter((f) => f.endsWith('.js'))
    expect(js.length).toBeGreaterThan(0)
    for (const f of js) expect(sw).toContain(`assets/${f}`)
    const precache = sw.match(/precacheAndRoute\((\[.*?\])/s)?.[1] ?? ''
    expect(precache).toContain('index.html')
    expect(precache).not.toMatch(/\.mp3|audio\//)
  })

  it('has a CacheFirst runtime route for audio into the audio cache', () => {
    const sw = read('sw.js')
    expect(sw).toContain('audio\\/[^/?]+\\.mp3$')
    expect(sw).toMatch(/cacheName:"audio"/)
    expect(sw).toMatch(/CacheFirst/)
  })
})
