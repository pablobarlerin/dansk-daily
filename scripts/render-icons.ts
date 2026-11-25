// Rasterises public/icons/icon.svg into the PNG app icons.
// Run: npm run icons   (tsx scripts/render-icons.ts)
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const dir = join(import.meta.dirname, '..', 'public', 'icons')
const source = readFileSync(join(dir, 'icon.svg'), 'utf8')

// Maskable: keep the art inside the 80% safe zone (Android crops to a circle or squircle).
const maskable = source.replace(
  '<g id="art">',
  '<g id="art" transform="translate(256 256) scale(0.78) translate(-256 -256)">',
)
if (maskable === source) throw new Error('icon.svg is missing <g id="art">')

const outputs: Array<[file: string, svg: string, size: number]> = [
  ['apple-touch-icon.png', source, 180],
  ['icon-192.png', source, 192],
  ['icon-512.png', source, 512],
  ['icon-maskable-512.png', maskable, 512],
]

for (const [file, svg, size] of outputs) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
  writeFileSync(join(dir, file), png)
  console.log(`${file} ${size}x${size}`)
}
