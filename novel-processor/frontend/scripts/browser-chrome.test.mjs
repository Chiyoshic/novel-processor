import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source = await readFile(new URL('../src/lib/browser-chrome.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const { resolveBrowserAppearance: resolve, applyBrowserAppearance: apply, isDarkColor } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
test('主站深浅模式与阅读背景独立，所有预设和自定义颜色决定浏览器文字明暗', () => {
  assert.deepEqual(resolve('light', null), { background: '#f5f8f9', colorScheme: 'light' })
  assert.deepEqual(resolve('dark', null), { background: '#111b21', colorScheme: 'dark' })
  for (const color of ['#f7f3eb', '#fafafa', '#e9efe5', '#ffffff']) assert.deepEqual(resolve('dark', color), { background: color, colorScheme: 'light' })
  for (const color of ['#191c1b', '#111111', '#000000']) assert.deepEqual(resolve('light', color), { background: color, colorScheme: 'dark' })
  assert.equal(resolve('dark', 'bad').background, '#111b21')
  assert.equal(isDarkColor('#f7f3eb'), false)
})
test('theme-color、html/body 安全区背景和 color-scheme 同步，离开阅读器还原', () => {
  let removed = false
  const meta = { content: '' }
  const document = { documentElement: { style: {} }, body: { style: {} }, querySelector: (selector) => selector.includes('apple-mobile') ? { remove: () => { removed = true } } : meta }
  for (const color of ['#f7f3eb', '#191c1b', '#e9efe5']) {
    apply(document, resolve('light', color))
    assert.equal(meta.content, color)
    assert.equal(document.documentElement.style.backgroundColor, color)
    assert.equal(document.body.style.backgroundColor, color)
    assert.equal(document.documentElement.style.colorScheme, isDarkColor(color) ? 'dark' : 'light')
  }
  apply(document, resolve('dark', null))
  assert.equal(meta.content, '#111b21'); assert.ok(removed)
})
test('缺少 meta 时自动补齐，文档 body 尚未出现也不报错', () => {
  const appended = []
  const document = { documentElement: { style: {} }, body: null, head: { appendChild: (value) => appended.push(value) }, querySelector: () => null, createElement: () => ({}) }
  apply(document, resolve('light', '#f7f3eb'))
  assert.deepEqual(appended, [{ name: 'theme-color', content: '#f7f3eb' }])
})
