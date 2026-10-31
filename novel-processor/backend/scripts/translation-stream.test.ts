/** Full offline HTTP pipeline: provider SSE -> API NDJSON -> browser parser -> SQLite. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LibraryDb } from '../server/db'
import { createLibraryApiHandler, type LibraryApiDeps } from '../server/libraryApi'
import { translationFixture } from './fixtures/translation'
import { readTranslationStream } from '../../frontend/src/lib/translationStream'
import type { NovelRecord } from '../src/lib/types'
import type { TranslationTaskEvent } from '../../shared/translation'

test('流式任务实时可读；保存完成事件与 SQLite 一致；失败不覆盖旧内容', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'translation-stream-'))
  const db = new LibraryDb(join(dir, 'test.sqlite'))
  let fail = false
  const provider = createServer(async (req, res) => {
    for await (const _chunk of req) { /* drain */ }
    if (fail) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'secret-provider-error' } })); return }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const text = JSON.stringify(translationFixture.result)
    const delta = (content: string, finish_reason: string | null) => ({ id: 'local', object: 'chat.completion.chunk', model: 'offline', choices: [{ index: 0, delta: { content }, finish_reason }] })
    res.write(`data: ${JSON.stringify(delta(text.slice(0, 80), null))}\n\n`)
    setTimeout(() => res.end(`data: ${JSON.stringify(delta(text.slice(80), 'stop'))}\n\ndata: [DONE]\n\n`), 30)
  })
  await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve))
  const model = db.upsertAiModel({ name: 'offline', apiType: 'chat-completions', baseUrl: `http://127.0.0.1:${(provider.address() as AddressInfo).port}/v1`, apiKey: 'not-real', model: 'offline', headers: {} })
  const record = { source: { site: 'syosetu', novelId: 'n4703ix', url: 'https://example.invalid' }, meta: { title: '旅のはじまり', author: { name: '作者' }, summary: '测试', tags: [] }, chapters: [], episodes: [{ index: 1, title: '第一话' }] } as unknown as NovelRecord
  await mkdir(join(dir, 'novels', 'syosetu'), { recursive: true })
  await writeFile(join(dir, 'novels', 'syosetu', 'n4703ix.json'), JSON.stringify(record))
  const handler = createLibraryApiHandler({ db, novelsDir: join(dir, 'novels'), store: { read: async () => ({ index: 1, title: '第一话', body: 'リナは旅に出た。', preface: '' }) } } as unknown as LibraryApiDeps)
  const server = createServer((req, res) => { void handler(req, res, () => { res.statusCode = 404; res.end() }) })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/library/syosetu/n4703ix/translation/initialize`
  const run = () => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' }, body: JSON.stringify({ modelId: model.id, chapterCount: 1, includeSummary: true, includePreface: true, requirements: '' }) })
  try {
    const events: TranslationTaskEvent[] = []
    let observedDeltaBeforeSaving = false
    const saved = await readTranslationStream(await run(), (event) => {
      events.push(event)
      if (event.type === 'delta' && !db.getTranslationInitialization('syosetu', 'n4703ix')) observedDeltaBeforeSaving = true
    })
    assert.ok(observedDeltaBeforeSaving)
    assert.deepEqual(events.map((event) => event.type), ['started', 'phase', 'phase', 'attempt', 'delta', 'delta', 'validating', 'validated', 'phase', 'completed'])
    assert.deepEqual(db.getTranslationInitialization('syosetu', 'n4703ix'), saved)
    assert.ok(saved.request.generation?.durationMs)
    assert.deepEqual(await (await fetch(url)).json(), saved)
    fail = true
    const failedEvents: TranslationTaskEvent[] = []
    await assert.rejects(readTranslationStream(await run(), (event) => failedEvents.push(event)), /模型服务拒绝请求/)
    assert.equal(failedEvents.at(-1)?.type, 'error')
    assert.equal(failedEvents.filter((event) => event.type === 'attempt').length, 1)
    assert.ok(!JSON.stringify(failedEvents).includes('secret-provider-error'))
    assert.deepEqual(db.getTranslationInitialization('syosetu', 'n4703ix'), saved)
  } finally {
    server.closeAllConnections(); provider.closeAllConnections()
    await Promise.all([new Promise<void>((resolve) => server.close(() => resolve())), new Promise<void>((resolve) => provider.close(() => resolve()))])
    db.close(); await rm(dir, { recursive: true, force: true })
  }
})

test('NDJSON 支持中文 UTF-8 跨包，缺少完成事件不能误报保存成功', async () => {
  const fixture = { ...translationFixture, id: 1, createdAt: '', updatedAt: '' }
  const bytes = new TextEncoder().encode(JSON.stringify({ type: 'completed', saved: fixture, at: Date.now() }) + '\n')
  const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close() } })
  const saved = await readTranslationStream(new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } }), () => {})
  assert.deepEqual(saved.result, fixture.result)
  await assert.rejects(readTranslationStream(new Response('{"type":"heartbeat","at":1}\n', { headers: { 'Content-Type': 'application/x-ndjson' } }), () => {}), /未收到保存成功/)
})
