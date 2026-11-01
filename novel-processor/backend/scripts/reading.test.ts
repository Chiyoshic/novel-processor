/** Isolated SQLite and local HTTP only; never touches the user's data. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import Database from 'better-sqlite3'
import { LibraryDb } from '../server/db'
import { createLibraryApiHandler, type LibraryApiDeps } from '../server/libraryApi'
import type { NovelRecord } from '../../shared/types'
import type { ReadingProgress, UpdateReading } from '../../shared/reading'
import { summarizeReading } from '../../shared/reading'

function catalog(novelId = 'reading-fixture'): NovelRecord {
  return {
    schemaVersion: '1.0',
    fetch: { fetchedAt: new Date().toISOString(), parserVersion: 'test', pagesFetched: 1, durationMs: 0, enrichedBy: [], warnings: [] },
    source: { site: 'syosetu', siteName: '测试站点', novelId, url: 'https://example.invalid/book' },
    meta: { title: '测试书', author: { name: '测试作者', url: null, siteUserId: null }, summary: '', status: 'completed', statusLabel: null, workType: 'serial', episodeCount: 4, chapterCount: 1, wordCount: null, firstPublishedAt: null, lastEpisodeAt: null, completedAt: null, tags: [], genre: null, genreCode: null, flags: { r15: false, r18: false, zankoku: false, bl: false, gl: false }, sourceUpdatedAt: null },
    chapters: [{ index: 1, title: '第一章', episodeStart: 1, episodeEnd: 2, episodeCount: 2 }],
    episodes: [1, 2, 3, 4].map((index) => ({ index, title: `第${index}话`, url: '', path: '', chapterIndex: index <= 2 ? 1 : null, chapterTitle: null, publishedAt: null, revisedAt: null, isRevised: false })),
  }
}
const site = 'syosetu', novelId = 'reading-fixture'
function setup() { const db = new LibraryDb(':memory:'); db.upsertCatalog(catalog()); return db }
test('默认全未读；在读/已读独立于下载和原文译文，两种语言共用一条记录', () => {
  const db = setup()
  try {
    assert.equal(db.readingProgress(site, novelId)!.states, '0000')
    assert.deepEqual(db.readingProgress(site, novelId)!.episodes.map((e) => e.updatedAt), [null, null, null, null])
    db.updateReading(site, novelId, { scope: 'episode', index: 1, status: 'reading' })
    const completed = db.updateReading(site, novelId, { scope: 'episode', index: 1, status: 'read' })
    assert.equal(completed.read, 1); assert.equal(completed.percent, 25); assert.equal(completed.states, '2000')
    assert.ok(completed.episodes[0]!.updatedAt)
    db.markContent(site, novelId, [1, 2, 3, 4])
    assert.equal(db.readingProgress(site, novelId)!.states, '2000')
    // Re-entering a completed episode is explicitly "reading" again.
    assert.equal(db.updateReading(site, novelId, { scope: 'episode', index: 1, status: 'reading' }).states, '1000')
  } finally { db.close() }
})
test('按章、未分章和全书修改，非法范围无写入；不影响其他作品', () => {
  const db = setup()
  try {
    db.upsertCatalog(catalog('other'))
    assert.equal(db.updateReading(site, novelId, { scope: 'chapter', chapterIndex: 1, status: 'read' }).states, '2200')
    assert.equal(db.updateReading(site, novelId, { scope: 'chapter', chapterIndex: null, status: 'reading' }).states, '2211')
    assert.equal(db.updateReading(site, novelId, { scope: 'book', status: 'read' }).states, '2222')
    for (const input of [{ scope: 'episode', index: 999, status: 'read' }, { scope: 'chapter', chapterIndex: 2, status: 'read' }, { scope: 'episode', index: 1, status: 'invalid' }, { scope: 'chapter', status: 'read' }, { scope: 'episode', index: 1.5, status: 'read' }]) {
      assert.throws(() => db.updateReading(site, novelId, input as UpdateReading))
      assert.equal(db.readingProgress(site, novelId)!.states, '2222')
    }
    assert.equal(db.readingProgress(site, 'other')!.states, '0000')
    assert.equal(db.updateReading(site, novelId, { scope: 'book', status: 'unread' }).states, '0000')
  } finally { db.close() }
})
test('书架汇总与目录一致，状态条按话序而不是阅读时间排序，空书和小数百分比安全', () => {
  const db = setup()
  try {
    db.updateReading(site, novelId, { scope: 'episode', index: 4, status: 'read' })
    db.updateReading(site, novelId, { scope: 'episode', index: 2, status: 'reading' })
    const { episodes: _, ...summary } = db.readingProgress(site, novelId)!
    assert.deepEqual(db.listNovels().items[0]!.reading, summary)
    assert.equal(summary.states, '0102'); assert.equal(summary.percent, 25)
    assert.equal(summarizeReading([{ status: 'read' }, { status: 'unread' }, { status: 'reading' }]).percent, 33.33)
    assert.equal(summarizeReading([]).percent, 0)
  } finally { db.close() }
})
test('目录重抓/下载状态同步不抹掉阅读记录，回收站恢复保留，永久删除级联清理', () => {
  const db = setup()
  try {
    db.updateReading(site, novelId, { scope: 'book', status: 'read' })
    const id = db.upsertCatalog(catalog())
    db.setContentFlags(id, [])
    assert.equal(db.readingProgress(site, novelId)!.states, '2222')
    db.trashNovel(site, novelId); db.restoreNovel(site, novelId)
    assert.equal(db.readingProgress(site, novelId)!.states, '2222')
    db.purgeNovel(site, novelId); db.upsertCatalog(catalog())
    assert.equal(db.readingProgress(site, novelId)!.states, '0000')
  } finally { db.close() }
})
test('SQLite 重启保留阅读记录；v7 非破坏迁移建表', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'novel-reading-'))
  const file = join(dir, 'library.sqlite')
  let db = new LibraryDb(file)
  try {
    db.upsertCatalog(catalog()); db.close()
    const legacy = new Database(file); legacy.exec('DROP TABLE episode_reading; PRAGMA user_version=7'); legacy.close()
    db = new LibraryDb(file)
    assert.equal(db.readingProgress(site, novelId)!.states, '0000')
    db.updateReading(site, novelId, { scope: 'episode', index: 3, status: 'read' })
    db.close(); db = new LibraryDb(file)
    assert.equal(db.readingProgress(site, novelId)!.states, '0020')
    assert.equal(db.listNovels().items[0]!.reading.read, 1)
  } finally { db.close(); await rm(dir, { recursive: true, force: true }) }
})
test('HTTP 阅读状态 GET/PUT、批量范围、错误码与书架汇总', async () => {
  const db = setup()
  const handler = createLibraryApiHandler({ db } as unknown as LibraryApiDeps)
  const server = createServer((req, res) => { void handler(req, res, () => { res.statusCode = 404; res.end() }) })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const path = `/library/${site}/${novelId}/reading`
  const put = (body: unknown) => fetch(base + path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  try {
    assert.equal((await (await fetch(base + path)).json() as ReadingProgress).states, '0000')
    const updated = await put({ scope: 'chapter', chapterIndex: 1, status: 'read' })
    assert.equal(updated.status, 200); assert.equal((await updated.json() as ReadingProgress).states, '2200')
    const library = await (await fetch(base + '/library')).json() as { items: Array<{ reading: { states: string } }> }
    assert.equal(library.items[0]!.reading.states, '2200')
    assert.equal((await put({ scope: 'book', status: 'invalid' })).status, 400)
    assert.equal((await put({ scope: 'episode', index: 999, status: 'read' })).status, 400)
    assert.equal((await fetch(base + '/library/syosetu/missing/reading')).status, 404)
    db.trashNovel(site, novelId)
    assert.equal((await put({ scope: 'book', status: 'read' })).status, 409)
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); db.close() }
})
