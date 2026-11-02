import assert from 'node:assert/strict'
import { test } from 'node:test'
import { INITIALIZATION_SYSTEM_PROMPT } from '../src/translation'
import { EPISODE_TRANSLATION_SYSTEM_PROMPT } from '../src/episode-translation'
import { MAINTENANCE_SYSTEM_PROMPT } from '../src/brief-maintenance'

test('初始化 aliases 同时覆盖有依据的原文和中文短名', () => {
  assert.doesNotMatch(INITIALIZATION_SYSTEM_PROMPT, /original_title、aliases 保留原文/)
  assert.match(INITIALIZATION_SYSTEM_PROMPT, /原文与中文共用的检索别名数组/)
  assert.match(INITIALIZATION_SYSTEM_PROMPT, /诺艾尔/)
  assert.match(INITIALIZATION_SYSTEM_PROMPT, /有歧义时不强行归属/)
})
test('逐话使用已有原序号非破坏增补中文别名', () => {
  assert.match(EPISODE_TRANSLATION_SYSTEM_PROMPT, /没有缺失中文别名需要补全/)
  assert.match(EPISODE_TRANSLATION_SYSTEM_PROMPT, /characters \+ update \+ baseline 原始 index/)
  assert.match(EPISODE_TRANSLATION_SYSTEM_PROMPT, /全部已有 aliases、已有 evidence/)
  assert.match(EPISODE_TRANSLATION_SYSTEM_PROMPT, /禁止用本话的少量别名覆盖旧数组/)
  assert.match(EPISODE_TRANSLATION_SYSTEM_PROMPT, /补别名不重写身份、关系、风格等无关字段/)
})
test('维护保留中日别名且不扩大允许修改的范围', () => {
  assert.match(MAINTENANCE_SYSTEM_PROMPT, /保留所有已有中日文别名/)
  assert.match(MAINTENANCE_SYSTEM_PROMPT, /只追加并去重/)
  assert.match(MAINTENANCE_SYSTEM_PROMPT, /不得为了补别名而修改不重复或未选角色/)
})
