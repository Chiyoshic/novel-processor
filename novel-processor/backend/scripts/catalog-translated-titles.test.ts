import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { LibraryDb } from '../server/db'
import { createLibraryApiHandler, type LibraryApiDeps } from '../server/libraryApi'
import { FsEpisodeStore } from '../src/storage/fs-store'
import type { NovelRecord } from '../../shared/types'
import type { EpisodeTranslationStatus } from '../../shared/episode-translation'

test('目录响应附带译文标题，缺失或空标题回退且不修改目录文件', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'catalog-titles-'))
  const novelsDir = join(dir, 'novels')
  const episodesDir = join(dir, 'episodes')
  const db = new LibraryDb(':memory:')
  const store = new FsEpisodeStore(episodesDir)
  const record = { source: { site: 'syosetu', novelId: 'test' }, episodes: [1, 2, 3, 4].map(index => ({ index, title: `原文${index}` })) } as NovelRecord
  await mkdir(join(novelsDir, 'syosetu'), { recursive: true })
  const path = join(novelsDir, 'syosetu', 'test.json')
  const original = JSON.stringify(record)
  await writeFile(path, original)
  const ref = { site: 'syosetu', novelId: 'test', canonicalUrl: '', variant: null }
  for (const [index, title] of [[1, ' 中文标题 '], [2, '   ']] as const) {
    await store.write(ref, { index, title: `原文${index}`, preface: '', body: '', bodyHtml: '', afterword: '', totalEpisodes: 4, translation: { title } } as Parameters<typeof store.write>[1])
  }
  for (const index of [1, 2, 3]) db.saveEpisodeTranslation({ site: 'syosetu', novelId: 'test', index, status: index === 1 ? 'stale' : 'translated', hasTranslation: true, translatedAt: null, updatedAt: '', modelName: '', sourceHash: '', attempts: 1, error: null, warnings: [], updates: [] } satisfies EpisodeTranslationStatus)
  const handler = createLibraryApiHandler({ db, store, novelsDir } as unknown as LibraryApiDeps)
  const server = createServer((req, res) => { void handler(req, res, () => { res.statusCode = 404; res.end() }) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/library/syosetu/test`)
    assert.equal(response.status, 200)
    const result = await response.json() as NovelRecord
    assert.deepEqual(result.episodes.map(episode => episode.translatedTitle), ['中文标题', null, null, null])
    assert.deepEqual(result.episodes.map(episode => episode.title), ['原文1', '原文2', '原文3', '原文4'])
    assert.equal(await readFile(path, 'utf8'), original)
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    db.close()
    await rm(dir, { recursive: true, force: true })
  }
})
