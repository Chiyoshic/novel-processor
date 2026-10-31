/** 仅使用本测试启动的 127.0.0.1 模型桩，不加载真实配置或密钥。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { setTimeout as sleep } from 'node:timers/promises'
import OpenAI from 'openai'
import { AiModelClient, DEFAULT_AI_RETRY_POLICY, retryAfterMs, type AiRetryPolicy } from '../src/ai'
import { AiGenerationError, AiOutputError } from '../src/ai-errors'
import { MAX_MODEL_JSON_BYTES, parseModelJson } from '../src/ai-json'
import { normalizeModelOutput } from '../src/ai-compat'
import { initializeTranslation, validateTranslationBrief } from '../src/translation'
import type { AiModelConfig } from '../server/db'
import type { EpisodeContent, NovelRecord } from '../src/lib/types'
import type { TranslationBrief } from '../../shared/translation'

const policy: Partial<AiRetryPolicy> = { maxAttempts: 3, totalTimeoutMs: 4000, requestTimeoutMs: 1000, baseDelayMs: 1, maxDelayMs: 50 }
function config(baseUrl: string, apiType: AiModelConfig['apiType'] = 'chat-completions'): AiModelConfig {
  return { id: 1, name: 'offline', provider: 'openai-compatible', apiType, baseUrl, apiKey: 'offline-not-a-key', model: 'offline', headers: { 'X-Offline-Test': 'true' }, windowTokens: 1000000, inputTokens: 900000, outputTokens: 10000, reasoningDialect: 'none', reasoningLevel: 'default', responseProfile: 'generic', extraBody: {}, enabled: true, createdAt: '', updatedAt: '' }
}
function json(res: ServerResponse, status: number, body: unknown): void { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
function chat(text: string, reason = 'stop') { return { id: 'test', object: 'chat.completion', model: 'offline', choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: reason }] } }
function response(text: string, status = 'completed') { return { id: 'resp_test', object: 'response', model: 'offline', status, output: [{ type: 'message', id: 'msg_test', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] }] } }
async function fixture(run: (url: string, requests: Array<Record<string, unknown>>) => Promise<void>, handler: (n: number, req: IncomingMessage, res: ServerResponse) => void | Promise<void>) {
  const requests: Array<Record<string, unknown>> = []
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    requests.push(JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>)
    assert.equal(req.headers['x-offline-test'], 'true')
    await handler(requests.length, req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, requests) }
  finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())) }
}
function validateOk(value: unknown): { ok: true } { assert.deepEqual(value, { ok: true }); return value as { ok: true } }
const brief: TranslationBrief = {
  schema_version: '1.0', language: 'zh-CN', novel: { original_title: '原作', chinese_title: '测试书名', plot_summary_zh: '莉娜出发旅行。' },
  characters: [{ original_name: 'リナ', chinese_name: '莉娜', aliases: [], identity_zh: '旅行者', naming_notes_zh: '音译', speech_style_zh: '简短', evidence: [{ episode_index: 1, quote: 'リナは旅に出た。' }], confidence: 'high' }],
  style: { overall_zh: '轻快', viewpoint_zh: '第三人称', narration_zh: '平实', dialogue_zh: '简洁', rhythm_zh: '短句', register_zh: '自然' }, terminology: [], worldbuilding_zh: [], address_rules_zh: [], translation_rules_zh: ['保持人名统一'], unresolved_questions_zh: [],
}
const record = { meta: { title: '原作', author: { name: '作者' }, summary: '简介', genre: '小说', tags: [] }, chapters: [], episodes: [{ index: 1 }] } as unknown as NovelRecord
const contents = [{ index: 1, title: '第一话', preface: '', body: 'リナは旅に出た。', bodyHtml: '', afterword: '', totalEpisodes: 1 }] satisfies EpisodeContent[]

test('默认三次总尝试、十分钟总时长，配置有界', () => {
  assert.equal(DEFAULT_AI_RETRY_POLICY.maxAttempts, 3)
  assert.equal(DEFAULT_AI_RETRY_POLICY.totalTimeoutMs, 600000)
  assert.throws(() => new AiModelClient(config('http://127.0.0.1'), { maxAttempts: 6 }))
})
test('修补围栏、BOM、逗号、注释、单引号和未引号键', () => {
  assert.deepEqual(parseModelJson('{"ok":true}'), { value: { ok: true }, repaired: false })
  for (const text of ["{ok: true,}", '{"ok": true /* note */}', '\uFEFF```json\n{"ok":true,}\n```', "{'ok':true}", '{"a":1 "ok":true}']) {
    const parsed = parseModelJson(text); assert.equal(parsed.repaired, true); assert.equal((parsed.value as { ok: boolean }).ok, true)
  }
})
test('拒绝截断、缺值、多根、超深和超大输出，不补造半包', () => {
  for (const text of ['{"ok":true', '{"ok":"截断}', '{"ok":}', '{"a":,}', '{"a":1}{"b":2}', '[]{}', '['.repeat(130) + ']'.repeat(130), '{"a":"' + 'x'.repeat(MAX_MODEL_JSON_BYTES) + '"}']) assert.throws(() => parseModelJson(text), AiOutputError)
})
test('DSML/think 修补不修改 JSON 内原文标签，不丢弃无效尾部', () => {
  const original = JSON.stringify({ quote: '<think>原文</think>', body: '<｜DSML｜invoke>原文' })
  assert.equal(normalizeModelOutput(original, 'deepseek', 'deepseek'), original)
  const dsml = '<｜DSML｜invoke name="submit_translation_brief"><｜DSML｜parameter name="brief" string="false">{ok:true,}</｜DSML｜parameter></｜DSML｜invoke>'
  assert.deepEqual(parseModelJson(normalizeModelOutput('<think>内部</think>' + dsml, 'deepseek', 'deepseek')).value, { ok: true })
  assert.throws(() => normalizeModelOutput(dsml.replace('</｜DSML｜invoke>', 'unknown</｜DSML｜invoke>'), 'deepseek', 'deepseek'))
})
test('429、503 共用三次预算，SDK 不套额外重试', async () => {
  await fixture(async (url, requests) => {
    const result = await new AiModelClient(config(url), policy).generate({ prompt: 'offline' })
    assert.equal(result.attempts, 3); assert.equal(requests.length, 3); assert.equal(result.text, '成功')
  }, (n, _req, res) => {
    if (n === 1) { res.setHeader('retry-after-ms', '5'); json(res, 429, { error: {} }) }
    else if (n === 2) json(res, 503, { error: {} })
    else json(res, 200, chat('成功'))
  })
})
test('400/401/403/404/422 不重试，错误不暴露原始响应', async () => {
  for (const status of [400, 401, 403, 404, 422]) await fixture(async (url, requests) => {
    await assert.rejects(new AiModelClient(config(url), policy).generate({ prompt: 'offline' }), (e: unknown) => e instanceof AiGenerationError && e.attempts === 1 && e.status === status && !e.message.includes('private-error'))
    assert.equal(requests.length, 1)
  }, (_n, _req, res) => json(res, status, { error: { message: 'private-error' } }))
})
test('Retry-After 支持毫秒、秒、日期；超过等待上限不提前重试', async () => {
  for (const [headers, expected] of [[{ 'retry-after-ms': '125' }, 125], [{ 'retry-after': '0.25' }, 250], [{ 'retry-after': 'Thu, 01 Jan 1970 00:00:02 GMT' }, 1000]] as const) assert.equal(retryAfterMs(new OpenAI.APIError(429, {}, '', new Headers(headers)), 1000), expected)
  await fixture(async (url, requests) => {
    await assert.rejects(new AiModelClient(config(url), policy).generate({ prompt: 'offline' }), AiGenerationError); assert.equal(requests.length, 1)
  }, (_n, _req, res) => { res.setHeader('retry-after', '60'); json(res, 429, { error: {} }) })
})
test('合法语法修补本地完成，只调用一次模型', async () => {
  await fixture(async (url, requests) => {
    const result = await new AiModelClient(config(url), policy).generateJson({ prompt: 'offline' }, validateOk)
    assert.equal(result.jsonRepaired, true); assert.equal(result.attempts, 1); assert.equal(requests.length, 1)
  }, (_n, _req, res) => json(res, 200, chat('```json\n{ok:true,}\n```')))
})
test('网络、格式和业务失败共享请求帽，失败不返回可存储结果', async () => {
  await fixture(async (url, requests) => {
    await assert.rejects(new AiModelClient(config(url), policy).generateJson({ prompt: 'offline' }, validateOk), (e: unknown) => e instanceof AiGenerationError && e.attempts === 3 && e.kind === 'invalid-output')
    assert.equal(requests.length, 3)
  }, (n, _req, res) => n === 1 ? json(res, 500, { error: {} }) : json(res, 200, chat(n === 2 ? '{"ok":' : '{"wrong":true}')))
})
test('证据失败用原始材料重生成，不回传失败文本诱导伪造证据', async () => {
  await fixture(async (url, requests) => {
    const result = await new AiModelClient(config(url), policy).generateJson({ system: '原始规则', prompt: '原始材料' }, (v) => validateTranslationBrief(v, record, contents))
    assert.equal(result.attempts, 2); assert.equal(result.value.characters[0]?.chinese_name, '莉娜')
    const messages = requests[1]!.messages as Array<{ content: string }>
    assert.match(messages[0]!.content, /原始规则/); assert.match(messages[0]!.content, /原文证据/); assert.equal(messages[1]!.content, '原始材料')
  }, (n, _req, res) => json(res, 200, chat(JSON.stringify(n === 1 ? { ...brief, characters: [{ ...brief.characters[0], evidence: [{ episode_index: 1, quote: '伪造证据' }] }] } : brief))))
})
test('Chat length 即使文本是完整 JSON 也不消费；拒答不重试', async () => {
  await fixture(async (url, requests) => {
    const result = await new AiModelClient(config(url), policy).generateJson({ prompt: 'offline' }, validateOk)
    assert.equal(result.attempts, 2); assert.equal(requests.length, 2)
  }, (n, _req, res) => json(res, 200, chat('{"ok":true}', n === 1 ? 'length' : 'stop')))
  await fixture(async (url, requests) => {
    await assert.rejects(new AiModelClient(config(url), policy).generate({ prompt: 'offline' }), (e: unknown) => e instanceof AiGenerationError && e.kind === 'refusal'); assert.equal(requests.length, 1)
  }, (_n, _req, res) => json(res, 200, chat('', 'content_filter')))
})
test('Responses incomplete 重试，不改变 reasoning 等级', async () => {
  await fixture(async (url, requests) => {
    const model = { ...config(url, 'responses'), reasoningDialect: 'deepseek' as const, reasoningLevel: 'high' as const }
    const result = await new AiModelClient(model, policy).generateJson({ prompt: 'offline' }, validateOk)
    assert.equal(result.attempts, 2); assert.deepEqual(requests[0]!.reasoning, { effort: 'high' }); assert.deepEqual(requests[1]!.reasoning, { effort: 'high' })
  }, (n, req, res) => { assert.equal(req.url, '/v1/responses'); json(res, 200, response('{"ok":true}', n === 1 ? 'incomplete' : 'completed')) })
})
test('单次网络超时可重试，总时长不可突破', async () => {
  await fixture(async (url, requests) => {
    const result = await new AiModelClient(config(url), { ...policy, requestTimeoutMs: 50 }).generate({ prompt: 'offline' })
    assert.equal(result.attempts, 2); assert.equal(requests.length, 2)
  }, (n, _req, res) => { if (n > 1) json(res, 200, chat('ok')) })
  await fixture(async (url, requests) => {
    const started = Date.now()
    await assert.rejects(new AiModelClient(config(url), { ...policy, totalTimeoutMs: 100, requestTimeoutMs: 1000 }).generate({ prompt: 'offline' }), (e: unknown) => e instanceof AiGenerationError && e.kind === 'timeout')
    assert.ok(Date.now() - started < 1000); assert.equal(requests.length, 1)
  }, () => {})
})
test('取消请求或退避会停止，不产生下一次调用', async () => {
  const controller = new AbortController()
  await fixture(async (url, requests) => {
    await assert.rejects(new AiModelClient(config(url), policy).generate({ prompt: 'offline', signal: controller.signal }), (e: unknown) => e instanceof AiGenerationError && e.kind === 'cancelled')
    await sleep(20); assert.equal(requests.length, 1)
  }, () => { controller.abort() })
  const second = new AbortController()
  await fixture(async (url, requests) => {
    await assert.rejects(new AiModelClient(config(url), { ...policy, baseDelayMs: 100, maxDelayMs: 100 }).generate({ prompt: 'offline', signal: second.signal }), (e: unknown) => e instanceof AiGenerationError && e.kind === 'cancelled')
    assert.equal(requests.length, 1)
  }, (_n, _req, res) => { json(res, 503, { error: {} }); setTimeout(() => second.abort(), 20) })
})
test('初始化成功记录尝试次数与修复状态', async () => {
  await fixture(async (url) => {
    const result = await initializeTranslation(record, contents, { modelId: 1, chapterCount: 1, includeSummary: true, includePreface: false, requirements: '' }, config(url))
    assert.equal(result.request.generation.attempts, 1); assert.equal(result.request.generation.jsonRepaired, true); assert.equal(result.result.novel.chinese_title, brief.novel.chinese_title)
  }, (_n, _req, res) => json(res, 200, chat('```json\n' + JSON.stringify(brief) + '\n```')))
})

function sse(res: ServerResponse, chunks: unknown[]): void {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' })
  for (const chunk of chunks) res.write(`data: ${JSON.stringify(chunk)}\n\n`)
  res.end('data: [DONE]\n\n')
}
function chatDelta(content: string, finish: string | null = null) {
  return { id: 'stream_test', object: 'chat.completion.chunk', model: 'offline', choices: [{ index: 0, delta: { content }, finish_reason: finish }] }
}
test('Chat 真实流式片段实时上报；思考只报告状态；本地修复和校验事件完整', async () => {
  await fixture(async (url, requests) => {
    const events: import('../../shared/ai-task').AiProgressEvent[] = []
    const result = await new AiModelClient(config(url), policy).generateJson({ prompt: 'offline', onProgress: (event) => events.push(event) }, validateOk)
    assert.equal(result.value.ok, true); assert.equal(result.jsonRepaired, true)
    assert.equal(requests[0].stream, true)
    assert.deepEqual(events.map((event) => event.type), ['attempt', 'activity', 'delta', 'delta', 'validating', 'validated'])
    assert.equal(JSON.stringify(events).includes('hidden-reasoning'), false)
    assert.deepEqual(events.filter((event) => event.type === 'delta').map((event) => event.text), ['{ok:', 'true,}'])
  }, (_n, _req, res) => sse(res, [
    { ...chatDelta(''), choices: [{ index: 0, delta: { reasoning_content: 'hidden-reasoning' }, finish_reason: null }] }, chatDelta('{ok:'), chatDelta('true,}', 'stop'),
  ]))
})
test('Chat 断流不消费半包，退避后使用独立的新调用输出', async () => {
  await fixture(async (url, requests) => {
    const events: import('../../shared/ai-task').AiProgressEvent[] = []
    const result = await new AiModelClient(config(url), policy).generateJson({ prompt: 'offline', onProgress: (event) => events.push(event) }, validateOk)
    assert.equal(result.attempts, 2); assert.equal(requests.length, 2)
    assert.equal(events.filter((event) => event.type === 'retry').length, 1)
    assert.deepEqual(events.filter((event) => event.type === 'delta').map((event) => event.attempt), [1, 2])
    assert.deepEqual(result.value, { ok: true })
  }, (n, _req, res) => sse(res, [chatDelta('{"ok":true}', n === 1 ? null : 'stop')]))
})
test('Responses 流式正文增量与 completed 必须同时满足，incomplete 自动重试', async () => {
  await fixture(async (url, requests) => {
    const events: import('../../shared/ai-task').AiProgressEvent[] = []
    const result = await new AiModelClient(config(url, 'responses'), policy).generateJson({ prompt: 'offline', onProgress: (event) => events.push(event) }, validateOk)
    assert.equal(result.attempts, 2); assert.equal(requests[0].stream, true)
    assert.equal(events.filter((event) => event.type === 'delta').length, 2)
  }, (n, _req, res) => sse(res, [
    { type: 'response.output_text.delta', delta: '{"ok":true}', output_index: 0, content_index: 0, item_id: 'msg', sequence_number: 1 },
    { type: n === 1 ? 'response.incomplete' : 'response.completed', response: response('{"ok":true}', n === 1 ? 'incomplete' : 'completed'), sequence_number: 2 },
  ]))
})
test('流式首包后悬挂仍受单次超时约束，取消立即停止且不重试', async () => {
  await fixture(async (url, requests) => {
    await assert.rejects(new AiModelClient(config(url), { ...policy, maxAttempts: 1, requestTimeoutMs: 70 }).generate({ prompt: 'offline', onProgress: () => {} }), (error: unknown) => error instanceof AiGenerationError && error.kind === 'timeout')
    assert.equal(requests.length, 1)
  }, (_n, _req, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write(`data: ${JSON.stringify(chatDelta('partial'))}\n\n`) })
  await fixture(async (url, requests) => {
    const controller = new AbortController()
    await assert.rejects(new AiModelClient(config(url), policy).generate({ prompt: 'offline', signal: controller.signal, onProgress: (event) => { if (event.type === 'delta') controller.abort() } }), (error: unknown) => error instanceof AiGenerationError && error.kind === 'cancelled')
    assert.equal(requests.length, 1)
  }, (_n, _req, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write(`data: ${JSON.stringify(chatDelta('partial'))}\n\n`) })
})
