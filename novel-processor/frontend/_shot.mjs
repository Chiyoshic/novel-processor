import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
for (const [name, url] of [['detail', '/novel/syosetu/n4703ix'], ['reader', '/novel/syosetu/n4703ix/episodes/108'], ['trash', '/trash']]) {
  await page.goto('http://localhost:5199' + url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `/tmp/s-${name}.png` })
}
const bad = await page.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll('button, input, select')) {
    const w = getComputedStyle(el).borderTopWidth
    if (w !== '0px') out.push(el.className + ' → ' + w)
  }
  return out
})
console.log('仍有 UA 边框的控件:', bad.length ? bad : '无')
await browser.close()
