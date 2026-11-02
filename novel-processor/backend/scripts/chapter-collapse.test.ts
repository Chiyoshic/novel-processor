import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readEpisodePrefix, withoutReadPrefix } from '../../shared/chapter-collapse'
import type { ReadingState } from '../../shared/reading'
const episodes = Array.from({ length: 14 }, (_, offset) => ({ index: offset + 1, chapterIndex: Math.floor(offset / 4) }))
const groups = [0, 1, 2, 3].map(index => ({ key: `c${index}`, episodes: episodes.filter(episode => episode.chapterIndex === index) }))
const states = (readCount: number) => new Map<number, ReadingState>(episodes.map(episode => [episode.index, episode.index <= readCount ? 'read' : 'unread']))

test('第11话未读：1–8话收入临时已读组，9/10话及后续正常展示', () => {
  const prefix = readEpisodePrefix(episodes, states(10))
  assert.deepEqual(prefix.map(episode => episode.index), [1,2,3,4,5,6,7,8])
  const remaining = withoutReadPrefix(groups, new Set(prefix.map(episode => episode.index)))
  assert.deepEqual(remaining.map(group => group.key), ['c2', 'c3'])
  assert.deepEqual(remaining.flatMap(group => group.episodes.map(episode => episode.index)), [9,10,11,12,13,14])
})
test('已读前缀可以在原章中间截断，不要求全章已读', () => {
  const prefix = readEpisodePrefix(episodes, states(8))
  const remaining = withoutReadPrefix(groups, new Set(prefix.map(episode => episode.index)))
  assert.deepEqual(prefix.map(episode => episode.index), [1,2,3,4,5,6])
  assert.deepEqual(remaining[0]?.episodes.map(episode => episode.index), [7,8])
  assert.deepEqual(remaining.map(group => group.key), ['c1','c2','c3'])
})
test('在读/无记录视为首个未读完话，不能越过未读空洞收集后续已读话', () => {
  for (const state of ['reading', undefined] as const) {
    const map = states(14); if (state) map.set(7, state); else map.delete(7)
    assert.deepEqual(readEpisodePrefix(episodes, map).map(episode => episode.index), [1,2,3,4])
  }
})
test('首话未读/不足两话时不分组，全书已读保留最后两话', () => {
  assert.deepEqual(readEpisodePrefix(episodes, states(0)), [])
  assert.deepEqual(readEpisodePrefix(episodes, states(2)), [])
  assert.deepEqual(readEpisodePrefix(episodes, states(14)).map(episode => episode.index), episodes.slice(0, -2).map(episode => episode.index))
  assert.deepEqual(readEpisodePrefix([], new Map()), [])
})
test('视图分组不更改原数据，展开临时组后每话恰好出现一次', () => {
  const original = structuredClone(groups)
  const prefix = readEpisodePrefix(episodes, states(8))
  const remaining = withoutReadPrefix(groups, new Set(prefix.map(episode => episode.index)))
  const displayed = [...prefix, ...remaining.flatMap(group => group.episodes)]
  assert.deepEqual(displayed, episodes)
  assert.equal(new Set(displayed.map(episode => episode.index)).size, episodes.length)
  assert.deepEqual(groups, original)
  assert.equal(remaining[0]?.episodes[0], episodes[6])
})
