/** Offline-only provider, real SQLite and episode JSON. No environment config or paid model is used. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { createLibraryApiHandler, type LibraryApiDeps } from '../server/libraryApi'
import { LibraryDb } from '../server/db'
import { FsEpisodeStore } from '../src/storage/fs-store'
import { EpisodeTranslationService } from '../server/episodeTranslationService'
import { applyBriefOperations } from '../src/translation-patches'
import { buildEpisodeTranslationInput, validateEpisodeTranslation, EPISODE_TRANSLATION_SYSTEM_PROMPT } from '../src/episode-translation'
import { hashEpisodeSource } from '../src/translation-source'
import { translationFixture } from './fixtures/translation'
import type { NovelRecord, EpisodeContent } from '../src/lib/types'
import type { TranslationBatchJob, TranslateEpisodesOptions } from '../../shared/episode-translation'
import type { AiModelConfig } from '../server/db'

const record = { source: { site: 'syosetu', novelId: 'n4703ix', url: 'https://example.invalid/book' }, meta: { title: '原作', author: { name: '作者' } }, chapters: [], episodes: [1, 2, 3, 4].map((index) => ({ index, title: `第${index}話` })) } as unknown as NovelRecord
const ref = { site: 'syosetu', novelId: 'n4703ix', canonicalUrl: record.source.url, variant: null }
const source = (index: number): EpisodeContent => ({ index, title: `第${index}話`, body: `これは${index}話の原文です。`, preface: '', bodyHtml: '<p>原文</p>', afterword: '', totalEpisodes: 4 })
const options = (modelId: number, indices = [1, 2, 3, 4]): TranslateEpisodesOptions => ({ modelId, indices, overwrite: false, requirements: '简体中文' })
async function waitJob(job: TranslationBatchJob) { const until = Date.now() + 8000; while (job.running && Date.now() < until) await sleep(10); assert.equal(job.running, false, 'batch should finish') }
function stream(res: ServerResponse, value: unknown) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' })
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  const chunk = (content: string, finish: string | null) => ({ id: 'offline', object: 'chat.completion.chunk', model: 'offline', choices: [{ index: 0, delta: { content }, finish_reason: finish }] })
  res.write(`data: ${JSON.stringify(chunk(text.slice(0, 30), null))}\n\n`)
  setTimeout(() => { res.end(`data: ${JSON.stringify(chunk(text.slice(30), 'stop'))}\n\ndata: [DONE]\n\n`) }, 15)
}
function output(index: number, updates: unknown = []) { return { translation: { title: `第${index}话译文`, preface: '', body: `这是第${index}话的完整译文。\n\n“你好。”`, afterword: '' }, updates } }
async function fixture(run: (ctx: { db: LibraryDb; store: FsEpisodeStore; service: EpisodeTranslationService; model: AiModelConfig; dir: string; locks: Set<string>; requests: Array<Record<string, unknown>> }) => Promise<void>, provider: (data: Record<string, unknown>, res: ServerResponse, requests: Array<Record<string, unknown>>) => void) {
  const dir = await mkdtemp(join(tmpdir(), 'episode-translation-'))
  const requests: Array<Record<string, unknown>> = []
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>
    const messages = body.messages as Array<{ content: string }>
    const prompt = messages.at(-1)!.content
    const data = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1)) as Record<string, unknown>
    requests.push(data)
    provider(data, res, requests)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const db = new LibraryDb(join(dir, 'library.db'))
  const store = new FsEpisodeStore(join(dir, 'episodes'))
  const locks = new Set<string>()
  const service = new EpisodeTranslationService(db, store, locks)
  const model = db.upsertAiModel({ name: 'offline', apiType: 'chat-completions', baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, apiKey: 'offline', model: 'offline', headers: {}, outputTokens: 8000 })
  db.saveTranslationInitialization({ ...translationFixture, modelId: model.id })
  for (const index of [1, 2, 3, 4]) await store.write(ref, source(index))
  try { await run({ db, store, service, model, dir, locks, requests }) }
  finally {
    service.stop(ref.site, ref.novelId)
    const job = service.snapshot(ref.site, ref.novelId).job
    if (job?.running) await waitJob(job)
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()))
    db.close(); await rm(dir, { recursive: true, force: true })
  }
}

test('材料 CRUD 按快照下标定位，非法项隔离，不改动输入对象', () => {
  const baseline = structuredClone(translationFixture.result)
  baseline.translation_rules_zh = ['规则 A', '规则 B', '规则 C']
  const before = structuredClone(baseline)
  const result = applyBriefOperations(baseline, [
    { field: 'translation_rules_zh', action: 'delete', index: 0 },
    { field: 'translation_rules_zh', action: 'update', index: 1, value: '更新 B' },
    { field: 'translation_rules_zh', action: 'create', value: '新增 D' },
    { field: 'translation_rules_zh', action: 'read', index: 2 },
    { field: 'translation_rules_zh', action: 'delete', index: 99 },
    { field: 'translation_rules_zh', action: 'update', index: 2, value: { invalid: true } },
    { field: '__proto__', action: 'update', value: {} },
    { field: 'novel', key: 'original_title', action: 'update', value: '不能修改原名' },
    { field: 'style', key: 'dialogue_zh', action: 'update', value: '自然口语' },
    { field: 'style', key: 'rhythm_zh', action: 'delete' },
  ], record)
  assert.deepEqual(baseline, before)
  assert.deepEqual(result.result.translation_rules_zh, ['更新 B', '规则 C', '新增 D'])
  assert.equal(result.result.style.dialogue_zh, '自然口语'); assert.equal(result.result.style.rhythm_zh, '')
  assert.equal(result.reports.filter((item) => item.status === 'ignored').length, 4)
  assert.equal(result.reports[3]?.value, '规则 C')
  assert.equal(result.warnings.length, 4)
  assert.equal(result.result.novel.original_title, baseline.novel.original_title)
})
test('无效 updates 不使有效译文失败，正文结构仍必须完整', () => {
  const article = validateEpisodeTranslation(output(1, { not: 'an-array' }))
  const patched = applyBriefOperations(translationFixture.result, article.updates, record)
  assert.equal(article.translation.body, output(1).translation.body)
  assert.equal(patched.warnings.length, 1); assert.equal(patched.changed, false)
  assert.throws(() => validateEpisodeTranslation({ translation: { title: '标题', body: '' } }))
})
test('提示词包含本话、最新基线、另一话完整译文及边界规则', () => {
  const model = { outputTokens: 2000, inputTokens: 100000, windowTokens: 200000 } as AiModelConfig
  const reference = { index: 2, title: '参考标题', body: '参考全文', preface: '', afterword: '' }
  const built = buildEpisodeTranslationInput(record, source(3), translationFixture.result, model, '自然中文', reference)
  const data = JSON.parse(built.prompt.slice(built.prompt.indexOf('\n') + 1))
  assert.equal(data.episode.index, 3); assert.deepEqual(data.reference_translation, reference)
  assert.deepEqual(data.baseline, translationFixture.result)
  assert.match(EPISODE_TRANSLATION_SYSTEM_PROMPT, /不得把其剧情、句子或人物状态复制进本话/)
  assert.match(EPISODE_TRANSLATION_SYSTEM_PROMPT, /序号/)
})
test('批量串行 + JSON 重试 + 每话落盘 + 材料增量 + 最近译文参考 + 单话失败后继续', async () => {
  await fixture(async ({ db, store, service, model, requests, locks, dir }) => {
    const job = service.start(record, options(model.id, [4, 2, 1, 3, 1]))
    assert.throws(() => service.start(record, options(model.id, [1])), /已有翻译/)
    assert.equal(locks.has(JSON.stringify([ref.site, ref.novelId])), true)
    await waitJob(job)
    assert.deepEqual(job.indices, [1, 2, 3, 4]); assert.deepEqual(job.done, [1, 2, 4]); assert.deepEqual(job.failed.map((item) => item.index), [3])
    assert.deepEqual(requests.map((item) => (item.episode as { index: number }).index), [1, 2, 2, 3, 4])
    assert.equal(requests[0]!.reference_translation, null)
    assert.equal((requests[1]!.reference_translation as { index: number }).index, 1)
    assert.equal((requests[4]!.reference_translation as { index: number }).index, 2)
    assert.equal((requests[1]!.baseline as { style: { overall_zh: string } }).style.overall_zh, '第一话补充的笔调')
    const episode = await store.read(ref, 1)
    assert.equal(episode?.body, source(1).body)
    assert.equal(episode?.translation?.body, output(1).translation.body)
    assert.equal(episode?.translation?.warnings.length, 1)
    assert.equal((await store.read(ref, 2))?.translation?.attempts, 2)
    const raw = JSON.parse(await readFile(join(dir, 'episodes', ref.site, ref.novelId, '2.json'), 'utf8'))
    assert.equal(raw.translation.referenceEpisodeIndex, 1)
    const statuses = db.listEpisodeTranslations(ref.site, ref.novelId)
    assert.equal(statuses.find((item) => item.index === 2)?.hasTranslation, true)
    assert.equal(statuses.find((item) => item.index === 3)?.hasTranslation, false)
    assert.equal(locks.size, 0)
    assert.equal(job.current?.events[0]?.type, 'attempt')
    const before = requests.length
    const skip = service.start(record, options(model.id, [1, 2]))
    await waitJob(skip)
    assert.deepEqual(skip.skipped, [1, 2]); assert.equal(requests.length, before)
  }, (data, res, requests) => {
    const index = (data.episode as { index: number }).index
    if (index === 3) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end('{"error":{"message":"offline-rejected"}}'); return }
    if (index === 2 && requests.filter((item) => (item.episode as { index: number }).index === 2).length === 1) { stream(res, '{"translation":'); return }
    stream(res, output(index, index === 1 ? [
      { field: 'style', key: 'overall_zh', action: 'update', value: '第一话补充的笔调' },
      { field: 'no-such-field', action: 'delete', index: 0 },
    ] : []))
  })
})
test('重新翻译失败保留旧译文；重新下载不抹掉译文；原文变化标记过期', async () => {
  let fail = false
  await fixture(async ({ service, model, store, db }) => {
    await waitJob(service.start(record, options(model.id, [1])))
    const old = (await store.read(ref, 1))!.translation!
    fail = true
    await waitJob(service.start(record, { ...options(model.id, [1]), overwrite: true }))
    assert.deepEqual((await store.read(ref, 1))!.translation, old)
    assert.equal(db.listEpisodeTranslations(ref.site, ref.novelId)[0]?.hasTranslation, true)
    assert.equal(db.listEpisodeTranslations(ref.site, ref.novelId)[0]?.status, 'failed')
    await store.write(ref, { ...source(1), body: '更新后的原文' })
    assert.deepEqual((await store.read(ref, 1))!.translation, old)
    db.invalidateEpisodeTranslation(ref.site, ref.novelId, 1, hashEpisodeSource((await store.read(ref, 1))!))
    assert.equal(db.listEpisodeTranslations(ref.site, ref.novelId)[0]?.status, 'stale')
  }, (_data, res) => { if (fail) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end('{}') } else stream(res, output(1)) })
})
test('停止当前流式请求并取消后续排队话，不误标翻译成功', async () => {
  await fixture(async ({ service, model, db, requests, locks }) => {
    const job = service.start(record, options(model.id, [1, 2, 3]))
    const until = Date.now() + 3000
    while (!job.current?.events.some((event) => event.type === 'delta') && Date.now() < until) await sleep(10)
    service.stop(ref.site, ref.novelId); await waitJob(job)
    assert.equal(requests.length, 1); assert.deepEqual(job.cancelled, [1, 2, 3]); assert.equal(locks.size, 0)
    assert.ok(db.listEpisodeTranslations(ref.site, ref.novelId).every((item) => !item.hasTranslation && item.status === 'cancelled'))
  }, (_data, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write('data: {"id":"offline","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":null}]}\n\n')
  })
})
test('SQLite 重启保留译文状态并收敛中断任务，清理作品同时清理翻译索引', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'translation-restart-'))
  let db = new LibraryDb(join(dir, 'test.db'))
  try {
    db.saveEpisodeTranslation({ site: ref.site, novelId: ref.novelId, index: 1, status: 'translating', hasTranslation: true, sourceHash: 'hash', translatedAt: '2026-11-01', modelName: 'offline', updatedAt: '', attempts: 1, error: null, warnings: [], updates: [] })
    db.close(); db = new LibraryDb(join(dir, 'test.db'))
    const status = db.listEpisodeTranslations(ref.site, ref.novelId)[0]!
    assert.equal(status.status, 'cancelled'); assert.equal(status.hasTranslation, true); assert.match(status.error!, /重启/)
    db.purgeNovel(ref.site, ref.novelId)
    assert.deepEqual(db.listEpisodeTranslations(ref.site, ref.novelId), [])
  } finally { db.close(); await rm(dir, { recursive: true, force: true }) }
})


test('第二步 HTTP API 启动、轮询、读取译文及字段错误处理', async () => {
  await fixture(async ({ db, store, model, dir }) => {
    await mkdir(join(dir, 'novels', ref.site), { recursive: true })
    await writeFile(join(dir, 'novels', ref.site, `${ref.novelId}.json`), JSON.stringify(record))
    const handler = createLibraryApiHandler({ db, store, novelsDir: join(dir, 'novels') } as unknown as LibraryApiDeps)
    const server = createServer((req, res) => { void handler(req, res, () => { res.statusCode = 404; res.end() }) })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/library/${ref.site}/${ref.novelId}`
    try {
      const invalid = await fetch(`${base}/translation/episodes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...options(model.id), indices: [999] }) })
      assert.equal(invalid.status, 400)
      const response = await fetch(`${base}/translation/episodes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options(model.id, [1, 2])) })
      assert.equal(response.status, 202)
      let snapshot = await response.json() as { job: TranslationBatchJob }
      const until = Date.now() + 5000
      while (snapshot.job.running && Date.now() < until) { await sleep(10); snapshot = await (await fetch(`${base}/translation/episodes`)).json() as typeof snapshot }
      assert.equal(snapshot.job.running, false); assert.deepEqual(snapshot.job.done, [1, 2])
      const content = await (await fetch(`${base}/episodes/1`)).json() as EpisodeContent
      assert.equal(content.translation?.body, output(1).translation.body)
      assert.equal(content.translation?.stale, false)
      const stop = await fetch(`${base}/translation/episodes/stop`, { method: 'POST' })
      assert.equal(stop.status, 200)
    } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())) }
  }, (data, res) => stream(res, output((data.episode as { index: number }).index)))
})
