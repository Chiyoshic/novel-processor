import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { parse, compileScript, compileStyle } from '@vue/compiler-sfc'
import ts from 'typescript'
import { createRenderer, h, nextTick, reactive } from 'vue'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../src/components/AppSelect.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const compiled = compileScript(descriptor, { id: 'select-test', inlineTemplate: true })
const js = ts.transpileModule(compiled.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const moduleSource = js.replace(/from ['"]vue['"]/g, `from ${JSON.stringify(pathToFileURL(require.resolve('vue')).href)}`)
const { default: AppSelect } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`)

globalThis.document = { addEventListener() {}, removeEventListener() {} }
class Element {
  constructor(tag) { this.tag = tag; this.props = {}; this.children = []; this.parent = null; this.text = '' }
  focus() { this.focused = true }
  matches() {
    for (let node = this; node; node = node.parent) if (node.props.disabled && (node === this || node.tag === 'fieldset')) return true
    return false
  }
  contains(target) { return this === target || this.children.some(child => child.contains(target)) }
  querySelector(selector) {
    const match = selector.match(/data-option-index="(\d+)"/)
    return find(this, node => String(node.props['data-option-index']) === match?.[1])
  }
  scrollIntoView() {}
}
function find(root, check) {
  if (check(root)) return root
  for (const child of root.children) { const result = find(child, check); if (result) return result }
  return null
}
const renderer = createRenderer({
  createElement: tag => new Element(tag), createText: text => Object.assign(new Element('#text'), { text }),
  createComment: text => Object.assign(new Element('#comment'), { text }),
  setText: (node, text) => { node.text = text }, setElementText: (node, text) => { node.text = text; node.children = [] },
  patchProp: (node, key, _, value) => { node.props[key] = value },
  parentNode: node => node.parent,
  nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  insert(node, parent, anchor) {
    if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1)
    const index = anchor ? parent.children.indexOf(anchor) : -1
    parent.children.splice(index < 0 ? parent.children.length : index, 0, node); node.parent = parent
  },
  remove(node) { if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = null },
})
function setup(extra = {}, fieldset = false) {
  const updates = []
  const state = reactive({ modelValue: 1, label: '测试', options: [{ value: 0, label: '请选择', disabled: true }, { value: 1, label: '一' }, { value: 2, label: '二' }], ...extra })
  const container = new Element('root')
  const app = renderer.createApp({ render: () => {
    const select = h(AppSelect, { ...state, 'onUpdate:modelValue': value => { updates.push(value); state.modelValue = value } })
    return fieldset ? h('fieldset', { disabled: true }, [select]) : select
  } })
  app.mount(container)
  const trigger = () => find(container, node => node.props.role === 'combobox')
  const root = () => find(container, node => !!node.props.onKeydown)
  const option = value => find(container, node => node.props.role === 'option' && node.props['aria-selected'] === (state.modelValue === value) && node.props['data-option-index'] === state.options.findIndex(item => item.value === value))
  const key = key => { root().props.onKeydown({ key, preventDefault() {}, stopPropagation() {} }) }
  return { app, state, updates, container, trigger, root, option, key }
}

test('数字选项保持 number；点击后关闭并将焦点返回触发器', async () => {
  const s = setup(); s.trigger().props.onClick(); await nextTick()
  s.option(2).props.onClick(); await nextTick()
  assert.deepEqual(s.updates, [2]); assert.equal(typeof s.state.modelValue, 'number')
  assert.equal(s.trigger().props['aria-expanded'], false); assert.equal(s.trigger().focused, true)
  s.app.unmount()
})
test('键盘移动不提前提交，跳过禁用选项，Enter 确认', async () => {
  const s = setup(); s.key('ArrowDown'); await nextTick(); s.key('ArrowUp'); await nextTick()
  assert.deepEqual(s.updates, []); s.key('Enter'); await nextTick(); assert.deepEqual(s.updates, [2])
  s.app.unmount()
})
test('Escape/Tab 关闭，禁用控件和继承的 fieldset 禁用不打开菜单', async () => {
  for (const [extra, fieldset] of [[{ disabled: true }, false], [{}, true]]) {
    const s = setup(extra, fieldset); s.trigger().props.onClick(); s.key('ArrowDown'); await nextTick()
    assert.equal(s.trigger().props['aria-expanded'], false); assert.deepEqual(s.updates, []); s.app.unmount()
  }
  const s = setup(); s.trigger().props.onClick(); await nextTick(); s.key('Escape'); await nextTick()
  assert.equal(s.trigger().props['aria-expanded'], false)
  s.trigger().props.onClick(); await nextTick(); s.key('Tab'); await nextTick()
  assert.equal(s.trigger().props['aria-expanded'], false); s.app.unmount()
})
test('禁用占位选项不满足 required；字符串选项保持字符串', async () => {
  const s = setup({ modelValue: 0, required: true })
  const validation = () => find(s.container, node => node.tag === 'input')
  assert.equal(validation().props.value, '')
  s.trigger().props.onClick(); await nextTick(); s.option(2).props.onClick(); await nextTick()
  assert.equal(validation().props.value, '2'); s.app.unmount()
  const text = setup({ modelValue: 'all', options: [{ value: 'all', label: '全部' }, { value: 'pending', label: '待译' }] })
  text.trigger().props.onClick(); await nextTick(); text.option('pending').props.onClick(); await nextTick()
  assert.deepEqual(text.updates, ['pending']); text.app.unmount()
})

test('所有页面和组件不再使用原生 select', () => {
  const root = new URL('../src/', import.meta.url)
  for (const file of readdirSync(root, { recursive: true }).filter(file => file.endsWith('.vue'))) {
    assert.doesNotMatch(readFileSync(new URL(file, root), 'utf8'), /<select\b/, file)
  }
})

test('柔和阴影默认关闭，可按使用位置开启或关闭', async () => {
  const s = setup()
  assert.doesNotMatch(s.root().props.class, /app-select--soft-shadow/)
  s.state.softShadow = true; await nextTick()
  assert.match(s.root().props.class, /app-select--soft-shadow/)
  s.state.softShadow = false; await nextTick()
  assert.doesNotMatch(s.root().props.class, /app-select--soft-shadow/)
  s.app.unmount()
})

test('夜间阴影必须绑定组件本身，不能编译成 html 上的变量而被局部样式覆盖', () => {
  const { code, errors } = compileStyle({ source: descriptor.styles[0].content, filename: 'AppSelect.vue', id: 'data-v-select-test', scoped: true })
  assert.deepEqual(errors, [])
  assert.match(code, /html\[data-theme=['"]dark['"]\] \.app-select--soft-shadow\s*\{\s*--select-trigger-shadow:/)
  assert.match(code, /html\[data-theme=['"]dark['"]\] \.app-select\s*\{\s*--select-menu-shadow:/)
})
