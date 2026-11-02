import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { FetchHttpClient } from '../src/lib/http'
import { NovelLibrary } from '../src/lib/library'
import { FsEpisodeStore } from '../src/storage/fs-store'
import { LibraryDb } from '../server/db'
import { createLibraryApiHandler, type LibraryApiDeps } from '../server/libraryApi'
import type { NovelRecord, SiteAdapter } from '../../shared/types'
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
async function promptAbort(promise: Promise<unknown>, controller: AbortController): Promise<void> {
  await delay(30); const started = Date.now(); controller.abort()
  await assert.rejects(promise, (error: unknown) => (error as { code?: string }).code === 'ABORTED')
  assert.ok(Date.now() - started < 1000, 'cancel must not wait out pacing or retry timers')
}
test('真实 HTTP 抓取的节奏等待、重试退避和并发排队均可立即取消', async () => {
  let calls = 0
  const provider = createServer((req, res) => { calls++; if (req.url === '/hold') return; res.writeHead(req.url === '/retry' ? 503 : 200); res.end('ok') })
  await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(provider.address() as AddressInfo).port}`
  try {
    const paced = new FetchHttpClient({ minIntervalMs: 5000, maxRetries: 0 })
    await paced.get(base + '/ok')
    const pacing = new AbortController(); await promptAbort(paced.get(base + '/ok', { signal: pacing.signal }), pacing)
    assert.equal(calls, 1)
    const retry = new AbortController(); await promptAbort(new FetchHttpClient({ minIntervalMs: 0 }).get(base + '/retry', { signal: retry.signal }), retry)
    const client = new FetchHttpClient({ minIntervalMs: 0, concurrency: 1, maxRetries: 0 })
    const holding = new AbortController()
    const first = client.get(base + '/hold', { signal: holding.signal }); void first.catch(() => {})
    await delay(20)
    const queued = new AbortController(); await promptAbort(client.get(base + '/ok', { signal: queued.signal }), queued)
    holding.abort(); await assert.rejects(first)
    assert.equal((await client.get(base + '/ok')).status, 200, 'semaphore must remain usable after cancellation')
  } finally { provider.closeAllConnections(); await new Promise<void>((resolve) => provider.close(() => resolve())) }
})
test('抓取 HTTP stop API 保留已写文件/旧译文、清理活动状态，完成后允许继续抓取', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'novel-cancel-fetch-'))
  const db = new LibraryDb(join(dir, 'library.sqlite'))
  const store = new FsEpisodeStore(join(dir, 'episodes'))
  const ref = { site: 'test', novelId: 'cancel-book', canonicalUrl: 'https://example.invalid/book/', variant: null }
  const record: NovelRecord = {
    schemaVersion: '1.0', source: { site: ref.site, siteName: 'test', novelId: ref.novelId, url: ref.canonicalUrl },
    meta: { title: 'test', author: { name: '', url: null, siteUserId: null }, summary: '', status: 'ongoing', statusLabel: null, workType: 'serial', episodeCount: 3, chapterCount: 0, wordCount: null, firstPublishedAt: null, lastEpisodeAt: null, completedAt: null, tags: [], genre: null, genreCode: null, flags: { r15: false, r18: false, zankoku: false, bl: false, gl: false }, sourceUpdatedAt: null },
    chapters: [], episodes: [1, 2, 3].map((index) => ({ index, title: String(index), url: '', path: '', chapterIndex: null, chapterTitle: null, publishedAt: null, revisedAt: null, isRevised: false })),
    fetch: { fetchedAt: '', parserVersion: 'test', pagesFetched: 1, durationMs: 0, enrichedBy: [], warnings: [] },
  }
  let startedSecond!: () => void
  const second = new Promise<void>((resolve) => { startedSecond = resolve })
  const provider = createServer((req, res) => { if (req.url === '/book/2/') { startedSecond(); return } res.end('ok') })
  await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve))
  const adapter: SiteAdapter = {
    id: 'test', name: 'test', hosts: ['example.invalid'], capabilities: { episodeContent: true, paginated: false, metaApi: false }, match: () => true, resolve: () => ref, indexUrl: () => '', parseIndexPage: () => { throw new Error('not used') },
    parseEpisodePage: (_text, _ref, index) => ({ index, title: String(index), body: '正文', preface: '', afterword: '', bodyHtml: '<p>正文</p>', totalEpisodes: 3 }),
  }
  const library = new NovelLibrary({ adapters: [adapter], store, http: new FetchHttpClient({ minIntervalMs: 0, maxRetries: 0, rewriteUrl: (url) => url.replace('https://example.invalid', `http://127.0.0.1:${(provider.address() as AddressInfo).port}`) }) })
  db.upsertCatalog(record)
  await mkdir(join(dir, 'novels', 'test'), { recursive: true })
  await writeFile(join(dir, 'novels', 'test', 'cancel-book.json'), JSON.stringify(record))
  await store.write(ref, { index: 2, title: '旧内容', body: '原有正文', preface: '', afterword: '', bodyHtml: '', totalEpisodes: 3 })
  const handler = createLibraryApiHandler({ db, store, library, novelsDir: join(dir, 'novels'), defaultConcurrency: 1, auditLogPath: join(dir, 'audit.log'), episodesDir: join(dir, 'episodes'), detectSite: () => 'test', syncFromDisk: async () => ({ novels: 1, episodes: 3 }), parseRange: (range) => range === '1-3' ? [1, 2, 3] : [Number(range)] } as LibraryApiDeps)
  const server = createServer((req, res) => { void handler(req, res, () => { res.statusCode = 404; res.end() }) })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/library/test/cancel-book`
  const post = (path: string, body: unknown = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  try {
    const running = post('/fetch', { range: '1-3', overwrite: true })
    await second
    assert.equal((await post('/fetch/stop')).status, 200)
    const result = await (await running).json() as { cancelled: boolean; fetched: number; failed: unknown[] }
    assert.equal(result.cancelled, true); assert.equal(result.fetched, 1); assert.deepEqual(result.failed, [])
    assert.equal((await store.read(ref, 1))!.body, '正文'); assert.equal((await store.read(ref, 2))!.body, '原有正文'); assert.equal(await store.read(ref, 3), null)
    const status = await (await fetch(base + '/status')).json() as { indices: number[]; job: { running: boolean; cancelled: boolean; activeIndices: number[] } }
    assert.deepEqual(status.indices, [1, 2]); assert.equal(status.job.running, false); assert.equal(status.job.cancelled, true); assert.deepEqual(status.job.activeIndices, [])
    assert.equal((await post('/fetch/stop')).status, 200)
    assert.equal((await post('/fetch', { range: '3' })).status, 200)
    assert.ok(await store.read(ref, 3))
  } finally { server.closeAllConnections(); provider.closeAllConnections(); await Promise.all([new Promise<void>((resolve) => server.close(() => resolve())), new Promise<void>((resolve) => provider.close(() => resolve()))]); db.close(); await rm(dir, { recursive: true, force: true }) }
})
