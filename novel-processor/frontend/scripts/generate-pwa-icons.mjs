import sharp from 'sharp'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root = new URL('../public/', import.meta.url)
const source = await readFile(new URL('app-icon.svg', root))
const monochrome = await readFile(new URL('app-icon-monochrome.svg', root))
await mkdir(new URL('icons/', root), { recursive: true })
const icons = [
  ['icons/pwa-192.png', 192], ['icons/pwa-512.png', 512], ['icons/pwa-maskable-512.png', 512],
  ['apple-touch-icon.png', 180], ['icons/apple-touch-icon-167.png', 167],
  ['icons/apple-touch-icon-152.png', 152], ['icons/apple-touch-icon-120.png', 120], ['favicon-32.png', 32],
]
for (const [name, size] of icons) {
  // Opaque, square images: iOS supplies its own rounded mask. Logo stays within maskable safe area.
  const image = await sharp(source).resize(size, size).flatten({ background: '#fff' }).removeAlpha().png().toBuffer()
  await writeFile(new URL(name, root), image)
}
for (const size of [192, 512]) {
  const image = await sharp(monochrome).resize(size, size).png().toBuffer()
  await writeFile(new URL(`icons/pwa-monochrome-${size}.png`, root), image)
}
console.log(`Generated ${icons.length + 2} PWA / Apple icons from ${fileURLToPath(new URL('app-icon.svg', root))}`)
