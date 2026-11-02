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

test('中途取消保留已完成的话，取消不计为失败且不再调度后续话', async () => {
  const controller = new AbortController()
  const calls: string[] = []
  let startedSecond!: () => void
  const second = new Promise<void>((resolve) => { startedSecond = resolve })
  const http: HttpClient = { get: async (url, init) => {
    calls.push(url)
    if (url.includes('/2/')) {
      startedSecond()
      await new Promise<void>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }))
    }
    return { url, status: 200, body: '' }
  } }
  const library = new NovelLibrary({ adapters: [adapter], http })
  const downloading = library.downloadEpisodes('https://example.invalid/book/', { indices: [1, 2, 3], signal: controller.signal })
  await second; controller.abort()
  const result = await downloading
  assert.equal(result.fetched, 1); assert.equal(result.failed.length, 0); assert.equal(calls.length, 2)
  assert.ok(await library.readEpisode('https://example.invalid/book/', 1))
  assert.equal(await library.readEpisode('https://example.invalid/book/', 2), null)
  assert.equal(await library.readEpisode('https://example.invalid/book/', 3), null)
})
