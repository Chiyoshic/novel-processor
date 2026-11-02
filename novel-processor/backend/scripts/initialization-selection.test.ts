import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseTranslationOptions, selectInitializationEpisodes } from '../src/translation'
import type { NovelRecord } from '../src/lib/types'

const record = {
  chapters: [{ episodeEnd: 3 }, { episodeEnd: 5 }],
  episodes: [1, 2, 3, 4, 5].map(index => ({ index })),
} as NovelRecord

test('显式 episode 仅选前N话，不扩到整章', () => {
  const options = parseTranslationOptions({ modelId: 1, chapterCount: 2, selectionUnit: 'episode', includeSummary: true, includePreface: false, requirements: '' })
  assert.equal(options.selectionUnit, 'episode')
  assert.deepEqual(selectInitializationEpisodes(record, options.chapterCount, options.selectionUnit).map(item => item.index), [1, 2])
  assert.deepEqual(selectInitializationEpisodes(record, 4, 'episode').map(item => item.index), [1, 2, 3, 4])
})
test('旧客户端保留默认按章的兼容行为', () => {
  assert.deepEqual(selectInitializationEpisodes(record, 1).map(item => item.index), [1, 2, 3])
  assert.deepEqual(selectInitializationEpisodes(record, 2, 'chapter').map(item => item.index), [1, 2, 3, 4, 5])
})
test('拒绝非法单位和超出话数的样本', () => {
  assert.throws(() => selectInitializationEpisodes(record, 6, 'episode'), /范围/)
  assert.throws(() => parseTranslationOptions({ modelId: 1, chapterCount: 2, selectionUnit: 'wrong', includeSummary: true, includePreface: true, requirements: '' }), /单位/)
})
