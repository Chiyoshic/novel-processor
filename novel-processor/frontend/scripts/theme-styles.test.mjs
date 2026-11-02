import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { compileStyle, parse } from '@vue/compiler-sfc'

const root = new URL('../src/', import.meta.url)

test('组件暗色样式不得污染 html 的全局文字色、背景或变量', () => {
  for (const file of readdirSync(root, { recursive: true }).filter(file => file.endsWith('.vue'))) {
    const { descriptor } = parse(readFileSync(new URL(file, root), 'utf8'))
    for (const style of descriptor.styles.filter(style => style.scoped)) {
      const { code, errors } = compileStyle({ source: style.content, filename: file, id: 'data-v-theme-test', scoped: true })
      assert.deepEqual(errors, [], file)
      assert.doesNotMatch(code, /html\[data-theme=['"]dark['"]\]\s*\{/, `${file}: 暗色覆盖必须保留组件选择器，不能落在 html 上`)
    }
  }
})

const expectedSelectors = {
  'NovelStatusTag.vue': [
    '.novel-status', '.novel-status--ongoing', '.novel-status--completed',
    '.novel-status--hiatus', '.novel-status--short', '.novel-status--unknown',
  ],
  'PillMultiSelect.vue': [
    ".pill-multi-select__option[aria-pressed='true']",
    ".pill-multi-select__option[aria-pressed='true']:hover:not(:disabled)",
  ],
  'CompactButton.vue': [
    '.compact-button--secondary.compact-button--danger',
    '.compact-button--secondary.compact-button--danger:hover:not(:disabled)',
  ],
  'BriefMaintenance.vue': ['.duplicate-action--match', '.duplicate-action--match:hover:not(:disabled)'],
}

for (const [file, selectors] of Object.entries(expectedSelectors)) {
  test(`${file} 的暗色与悬浮配色只应用于目标组件`, () => {
    const { descriptor } = parse(readFileSync(new URL(`components/${file}`, root), 'utf8'))
    const code = descriptor.styles.map(style => compileStyle({ source: style.content, filename: file, id: 'data-v-theme-test', scoped: style.scoped }).code).join('\n')
    for (const selector of selectors) {
      assert.ok(code.includes(`html[data-theme='dark'] ${selector} {`), `${file}: 丢失 ${selector}`)
    }
  })
}
