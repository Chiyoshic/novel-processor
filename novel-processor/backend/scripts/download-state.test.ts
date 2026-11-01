import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NovelLibrary } from '../src/lib/library'
import type { SiteAdapter, HttpClient } from '../../shared/types'
const adapter: SiteAdapter = {
  id: 'test', name: 'test', hosts: ['example.invalid'],
  capabilities: { episodeContent: true, paginated: false, metaApi: false },
  match: () => true,
  resolve: () => ({ site: 'test', novelId: 'test', canonicalUrl: 'https://example.invalid/book/', variant: null }),
  indexUrl: () => '', parseIndexPage: () => { throw new Error('not used') },
  parseEpisodePage: (_html, _ref, index) => ({ index, title: '标题', body: '正文', bodyHtml: '<p>正文</p>', totalEpisodes: 2, preface: '', afterword: '' }),
}
test('实际抓取状态经下载服务透传；成功失败均结束，已存跳过不显示抓取', async () => {
  const http: HttpClient = { get: async (url) => { if (url.includes('/2/')) throw new Error('offline failure'); return { url, status: 200, body: '' } } }
  const library = new NovelLibrary({ adapters: [adapter], http })
  const events: Array<[number, boolean]> = []
  const result = await library.downloadEpisodes('https://example.invalid/book/', { indices: [1, 2], onEpisodeState: (index, active) => { events.push([index, active]) } })
  assert.equal(result.fetched, 1); assert.equal(result.failed.length, 1)
  assert.deepEqual(events, [[1, true], [1, false], [2, true], [2, false]])
  events.length = 0
  const skipped = await library.downloadEpisodes('https://example.invalid/book/', { indices: [1], onEpisodeState: (index, active) => { events.push([index, active]) } })
  assert.equal(skipped.skipped, 1); assert.deepEqual(events, [])
})
