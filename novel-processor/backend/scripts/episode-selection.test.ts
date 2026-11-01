import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validEpisodeRange, selectEpisodeRange, selectFirstUntranslated } from '../../shared/episode-selection'

test('范围选择包含两端，按号排序去重，跳过不允许翻译/未下载话', () => {
  assert.deepEqual(selectEpisodeRange([8, 1, 5, 3, 2, 2], new Set([1, 2, 5]), 2, 5), [2, 5])
  assert.deepEqual(selectEpisodeRange([1, 2, 3], new Set([3]), 1, 2), [])
})
test('最早未译 N 话只选择已下载的缺失/过期译文，不受输入顺序和已译章节间隔干扰', () => {
  assert.deepEqual(selectFirstUntranslated([8, 7, 3, 2, 1, 4, 3], new Set([1, 2, 3, 7, 8]), new Set([1, 3]), 2), [2, 7])
  assert.deepEqual(selectFirstUntranslated([1, 2, 3], new Set([1, 2]), new Set([1]), 10), [2])
  assert.deepEqual(selectFirstUntranslated([1, 2, 3], new Set(), new Set(), 10), [])
})
test('非法范围、空输入、倒序、小数、过大批次不会通过校验', () => {
  for (const [start, end] of [[0, 2], [3, 2], [1.5, 3], [NaN, 2], [1, Infinity]]) {
    assert.equal(validEpisodeRange(start, end), false)
    assert.throws(() => selectEpisodeRange([1, 2, 3], new Set([1]), start, end))
  }
  assert.equal(validEpisodeRange('', 2), false)
  for (const count of [0, -1, 1.5, 1001, NaN]) assert.throws(() => selectFirstUntranslated([1], new Set([1]), new Set(), count))
})
