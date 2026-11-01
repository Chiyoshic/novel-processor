import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import sharp from 'sharp'
const dist = new URL('../dist/', import.meta.url)
const html = await readFile(new URL('index.html', dist), 'utf8')
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', dist), 'utf8'))
assert.equal(manifest.display, 'standalone')
assert.equal(manifest.start_url, '/')
assert.equal(manifest.scope, '/')
assert.equal(manifest.id, '/')
assert.match(html, /rel="manifest"/)
assert.match(html, /apple-mobile-web-app-capable[^>]+content="yes"/)
assert.match(html, /viewport-fit=cover/)
for (const icon of manifest.icons) {
  const file = new URL(icon.src.slice(1), dist)
  const info = await sharp(await readFile(file)).metadata()
  const size = Number(icon.sizes.split('x')[0])
  assert.equal(info.width, size); assert.equal(info.height, size)
  assert.equal(info.hasAlpha, icon.purpose === 'monochrome')
}
assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable' && icon.sizes === '512x512'))
for (const [file, size] of [['apple-touch-icon.png', 180], ['icons/apple-touch-icon-167.png', 167], ['icons/apple-touch-icon-152.png', 152], ['icons/apple-touch-icon-120.png', 120]]) {
  assert.ok(html.includes(`href="/${file}?v=adaptive-v2"`))
  const info = await sharp(await readFile(new URL(file, dist))).metadata()
  assert.equal(info.width, size); assert.equal(info.height, size); assert.equal(info.hasAlpha, false)
}
// Apple uses opaque icons; keep a uniform neutral background for foreground extraction.
const apple = await sharp(await readFile(new URL('apple-touch-icon.png', dist))).raw().toBuffer({ resolveWithObject: true })
assert.equal(apple.info.channels, 3)
for (const [x, y] of [[0, 0], [179, 0], [0, 179], [179, 179]]) {
  const offset = (y * 180 + x) * 3
  assert.deepEqual([...apple.data.subarray(offset, offset + 3)], [255, 255, 255])
}
assert.ok(manifest.icons.some((icon) => icon.purpose === 'monochrome'))
const mono = await sharp(await readFile(new URL('icons/pwa-monochrome-512.png', dist))).ensureAlpha().raw().toBuffer()
let visible = 0
for (let index = 0; index < mono.length; index += 4) {
  if (mono[index + 3]) { visible++; assert.equal(mono[index], 0); assert.equal(mono[index + 1], 0); assert.equal(mono[index + 2], 0) }
}
assert.ok(visible > 20000, 'foreground must be a substantial silhouette, not fine strokes')
const sw = await readFile(new URL('sw.js', dist), 'utf8')
assert.ok(sw.includes('index.html'))
assert.ok(sw.includes('NavigationRoute'))
assert.ok(sw.includes('SKIP_WAITING'))
assert.match(sw, /addEventListener\("message"[^;]+SKIP_WAITING[^;]+self\.skipWaiting\(\)/, 'activation must be gated by the update message')
const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map((entry) => entry[1])
assert.ok(urls.length > 10)
for (const path of urls) {
  assert.ok(!path.startsWith('http'), 'no external resources/API responses in precache')
  assert.ok(!path.startsWith('api/'))
  await access(new URL(path.replace(/^\//, ''), dist))
}
console.log(`PASS PWA manifest, ${urls.length} cached static assets, Apple opaque PNGs, monochrome alpha/solid silhouette, safe update strategy`)
