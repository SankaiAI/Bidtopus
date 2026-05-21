/**
 * Derive every favicon size we ship from `app/icon.svg`.
 *
 * Run with: node scripts/generate-favicon.mjs
 *
 * Outputs:
 *   app/favicon.ico         — multi-res 16/32/48 for Windows + legacy browsers
 *   app/apple-icon.png      — 180x180 for iOS home screen + Safari pinned
 *   public/icon-96.png      — Google search indexing (multiple-of-48 rule)
 *   public/icon-192.png     — Android Chrome standard
 *   public/icon-512.png     — Android Chrome high-res + PWA install
 *
 * The SVG itself is served as-is at /icon.svg (Next.js App Router convention)
 * for modern browsers that prefer vector.
 */
import sharp from 'sharp'
import toIco from 'to-ico'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SVG_PATH = path.join(ROOT, 'app', 'icon.svg')

const svg = await fs.readFile(SVG_PATH)

// Render the SVG at high density so the rasterized bitmaps are crisp at every
// target size. density=384 (DPI) gives us 4x the default, which prevents the
// thin strokes from going blurry at the small sizes.
const rasterize = (size) =>
  sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

const [b16, b32, b48, b96, b180, b192, b512] = await Promise.all(
  [16, 32, 48, 96, 180, 192, 512].map(rasterize),
)

await fs.mkdir(path.join(ROOT, 'public'), { recursive: true })

// Multi-resolution ICO. Windows taskbar / legacy browsers pick the size they need.
const ico = await toIco([b16, b32, b48])
await fs.writeFile(path.join(ROOT, 'app', 'favicon.ico'), ico)
console.log('wrote app/favicon.ico (16+32+48 multi-res)')

await fs.writeFile(path.join(ROOT, 'app', 'apple-icon.png'), b180)
console.log('wrote app/apple-icon.png (180x180)')

await fs.writeFile(path.join(ROOT, 'public', 'icon-96.png'), b96)
console.log('wrote public/icon-96.png (96x96, Google search)')

await fs.writeFile(path.join(ROOT, 'public', 'icon-192.png'), b192)
console.log('wrote public/icon-192.png (192x192, Android Chrome)')

await fs.writeFile(path.join(ROOT, 'public', 'icon-512.png'), b512)
console.log('wrote public/icon-512.png (512x512, Android Chrome / PWA install)')

console.log('\nAll favicon assets generated from app/icon.svg.')
