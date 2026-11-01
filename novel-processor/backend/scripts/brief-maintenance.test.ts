/** Offline model fixtures and isolated SQLite only; never modifies an exported/user baseline. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { findBriefDuplicates } from '../../shared/brief-maintenance'
import type { MaintenanceOptions, MaintenancePreview } from '../../shared/brief-maintenance'
import { briefHash, briefBytes, validateMaintenanceOutput } from '../src/brief-maintenance'
import { applyBriefOperations } from '../src/translation-patches'
import { translationFixture } from './fixtures/translation'
import { LibraryDb } from '../server/db'
import { createLibraryApiHandler, type LibraryApiDeps } from '../server/libraryApi'
import { readMaintenanceStream } from '../../frontend/src/lib/translationStream'
import type { NovelRecord } from '../src/lib/types'
import type { TranslationTaskEvent } from '../../shared/translation'
const record = { meta: { title: translationFixture.result.novel.original_title } } as NovelRecord
function baseline() {
  const value = structuredClone(translationFixture.result)
  value.characters.push({ ...structuredClone(value.characters[0]!), identity_zh: '新增身份信息', evidence: [{ episode_index: 2 }] })
  return value
}
function options(value = baseline()): MaintenanceOptions { return { mode: 'deduplicate', modelId: 1, baseHash: briefHash(value), modules: ['characters'], scope: 'selected', groups: [{ field: 'characters', indices: [0, 1] }] } }
function merged(value = baseline()) { return { ...value.characters[0]!, identity_zh: 'AI 整合后的旅行者身份', evidence: [{ episode_index: 1 }, { episode_index: 2 }] } }

test('同原名/明确别名提示重复，但不凭同中文译名合并不同人物', () => {
  const value = baseline()
  value.characters.push({ ...structuredClone(value.characters[0]!), original_name: '別人', aliases: [] })
  assert.deepEqual(findBriefDuplicates(value).map((group) => group.indices), [[0, 1]])
  value.characters[2]!.aliases = ['リナ']
  assert.deepEqual(findBriefDuplicates(value).map((group) => group.indices), [[0, 1, 2]])
})
test('重复 create 忽略并告警，不机械覆盖；update 仍可整合新信息', () => {
  const value = baseline(); value.characters.pop()
  const result = applyBriefOperations(value, [
    { field: 'characters', action: 'create', value: { ...value.characters[0], identity_zh: '不该新增重复' } },
    { field: 'characters', action: 'update', index: 0, value: { ...value.characters[0], identity_zh: '正常更新的新信息' } },
  ], record)
  assert.equal(result.result.characters.length, 1)
  assert.equal(result.reports[0]!.status, 'ignored')
  assert.match(result.warnings[0]!, /重复/)
  assert.equal(result.result.characters[0]!.identity_zh, '正常更新的新信息')
  assert.equal(value.characters[0]!.identity_zh, translationFixture.result.characters[0]!.identity_zh)
})
test('AI 合并所选组，保留译名、别名和来源，未选模块不动', () => {
  const value = baseline()
  const output = { merges: [{ field: 'characters', indices: [0, 1], value: merged(value), reason: '同一人物不同阶段信息整合' }] }
  const result = validateMaintenanceOutput(output, value, options(value), record)
  assert.equal(result.result.characters.length, 1)
  assert.equal(result.result.characters[0]!.identity_zh, merged(value).identity_zh)
  assert.deepEqual(result.result.terminology, value.terminology)
  assert.equal(value.characters.length, 2)
  assert.equal(result.changes.length, 1)
})
test('越权合并、来源丢失、重命名或重叠组均不能应用', () => {
  const value = baseline()
  const valid = { field: 'characters', indices: [0, 1], value: merged(value), reason: '合并' }
  for (const output of [
    { merges: [{ ...valid, field: 'terminology' }] },
    { merges: [{ ...valid, value: { ...merged(value), evidence: [] } }] },
    { merges: [{ ...valid, value: { ...merged(value), chinese_name: '擅自改名' } }] },
    { merges: [valid, valid] },
  ]) assert.throws(() => validateMaintenanceOutput(output, value, options(value), record))
})
test('按模块压缩，不改译名/数量/来源，未变小模块保留；允许 AI 不确认任何重复', () => {
  const value = baseline()
  value.style.overall_zh = '长篇重复说明。'.repeat(30)
  const result = validateMaintenanceOutput({ replacements: [{ field: 'style', value: { ...value.style, overall_zh: '轻快自然。' }, reason: '精简重复说明' }] }, value, { ...options(value), mode: 'compress', modules: ['style'] }, record)
  assert.ok(briefBytes(result.result) < briefBytes(value))
  assert.deepEqual(result.result.characters, value.characters)
  assert.throws(() => validateMaintenanceOutput({ replacements: [{ field: 'characters', value: [value.characters[0]], reason: '删角色压缩' }] }, value, { ...options(value), mode: 'compress' }, record))
  const same = validateMaintenanceOutput({ replacements: [{ field: 'style', value: { ...value.style, overall_zh: value.style.overall_zh + '更长' }, reason: '无效压缩' }] }, value, { ...options(value), mode: 'compress', modules: ['style'] }, record)
  assert.deepEqual(same.result, value); assert.equal(same.warnings.length, 1)
  assert.equal(validateMaintenanceOutput({ merges: [] }, value, options(value), record).changes.length, 0)
})
test('预览不写原材料，应用事务备份、拒绝旧哈希和重复应用，恢复也先备份', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'brief-maintenance-db-'))
  const db = new LibraryDb(join(dir, 'library.db'))
  try {
    const value = baseline()
    const saved = db.saveTranslationInitialization({ ...translationFixture, result: value })
    const maintained = validateMaintenanceOutput({ merges: [{ field: 'characters', indices: [0, 1], value: merged(value), reason: '总结' }] }, value, options(value), record)
    const preview: MaintenancePreview = { id: 'offline-preview', baseHash: briefHash(value), mode: 'deduplicate', createdAt: new Date().toISOString(), beforeBytes: briefBytes(value), afterBytes: briefBytes(maintained.result), ...maintained, modelName: 'offline', generation: { attempts: 1, jsonRepaired: false } }
    db.saveMaintenancePreview(saved.site, saved.novelId, preview)
    assert.deepEqual(db.getTranslationInitialization(saved.site, saved.novelId), saved)
    const applied = db.applyMaintenancePreview(saved.site, saved.novelId, preview.id)
    assert.equal(applied.result.characters.length, 1)
    assert.throws(() => db.applyMaintenancePreview(saved.site, saved.novelId, preview.id), /已应用/)
    const revision = db.listBriefRevisions(saved.site, saved.novelId)[0]!
    assert.throws(() => db.restoreBriefRevision(saved.site, saved.novelId, revision.id, briefHash(value)), /已更新/)
    const restored = db.restoreBriefRevision(saved.site, saved.novelId, revision.id, briefHash(applied.result))
    assert.deepEqual(restored.result, value)
    db.saveMaintenancePreview(saved.site, saved.novelId, { ...preview, id: 'stale-preview' })
    db.saveTranslationInitialization({ ...restored, result: { ...value, style: { ...value.style, overall_zh: '新更新' } } })
    assert.throws(() => db.applyMaintenancePreview(saved.site, saved.novelId, 'stale-preview'), /材料已/)
    assert.equal(db.getTranslationInitialization(saved.site, saved.novelId)!.result.style.overall_zh, '新更新')
  } finally { db.close(); await rm(dir, { recursive: true, force: true }) }
})
test('HTTP 模型流式预览、确认应用、历史恢复；锁定期间阻止翻译并拒绝过时预览', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'brief-maintenance-http-'))
  const db = new LibraryDb(join(dir, 'db.sqlite'))
  const value = baseline()
  let calls = 0
  const provider = createServer(async (req, res) => {
    for await (const _chunk of req) { /* offline */ }
    calls++
    const text = JSON.stringify({ merges: [{ field: 'characters', indices: [0, 1], value: merged(value), reason: '同角色整合' }] })
    const chunk = (content: string, finish_reason: string | null) => ({ id: 'offline', object: 'chat.completion.chunk', model: 'offline', choices: [{ index: 0, delta: { content }, finish_reason }] })
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write(`data: ${JSON.stringify(chunk(text.slice(0, 30), null))}\n\n`)
    setTimeout(() => res.end(`data: ${JSON.stringify(chunk(text.slice(30), 'stop'))}\n\ndata: [DONE]\n\n`), 60)
  })
  await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve))
  const model = db.upsertAiModel({ name: 'offline', model: 'offline', apiType: 'chat-completions', baseUrl: `http://127.0.0.1:${(provider.address() as AddressInfo).port}/v1`, apiKey: 'offline', headers: {} })
  const saved = db.saveTranslationInitialization({ ...translationFixture, result: value })
  await mkdir(join(dir, 'novels', saved.site), { recursive: true })
  await writeFile(join(dir, 'novels', saved.site, `${saved.novelId}.json`), JSON.stringify(record))
  const handler = createLibraryApiHandler({ db, novelsDir: join(dir, 'novels') } as unknown as LibraryApiDeps)
  const server = createServer((req, res) => { void handler(req, res, () => { res.statusCode = 404; res.end() }) })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/library/${saved.site}/${saved.novelId}/translation`
  const post = (path: string, data: unknown) => fetch(`${url}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  try {
    const status = await (await fetch(`${url}/maintenance`)).json() as { baseHash: string; duplicates: unknown[] }
    assert.equal(status.duplicates.length, 1)
    const response = await post('maintenance/preview', { ...options(value), modelId: model.id })
    assert.equal(response.status, 200)
    assert.equal((await post('initialize', {})).status, 409)
    const events: TranslationTaskEvent[] = []
    const preview = await readMaintenanceStream(response, (event) => events.push(event))
    assert.equal(events.at(-1)!.type, 'maintenance-preview'); assert.ok(events.some((event) => event.type === 'delta'))
    assert.equal(calls, 1)
    assert.equal(db.getTranslationInitialization(saved.site, saved.novelId)!.result.characters.length, 2)
    const applied = await post('maintenance/apply', { previewId: preview.id })
    assert.equal(applied.status, 200)
    const revisions = db.listBriefRevisions(saved.site, saved.novelId)
    assert.equal(revisions.length, 1)
    const current = db.getTranslationInitialization(saved.site, saved.novelId)!
    const restored = await post('maintenance/restore', { revisionId: revisions[0]!.id, baseHash: briefHash(current.result) })
    assert.equal(restored.status, 200)
    assert.equal(db.getTranslationInitialization(saved.site, saved.novelId)!.result.characters.length, 2)
    const stale = await post('maintenance/preview', { ...options(value), baseHash: '0'.repeat(64), modelId: model.id })
    assert.equal(stale.status, 409); assert.equal(calls, 1)
  } finally {
    server.closeAllConnections(); provider.closeAllConnections()
    await Promise.all([new Promise<void>((resolve) => server.close(() => resolve())), new Promise<void>((resolve) => provider.close(() => resolve()))])
    db.close(); await rm(dir, { recursive: true, force: true })
  }
})
