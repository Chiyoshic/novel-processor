/** 独立 Node HTTP 服务的书库 API，保持既有 JSON 契约。 */
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import type { ReadingProgressFilter, UpdateReading } from '../../shared/reading'
import { randomUUID } from 'node:crypto'
import { briefHash, briefBytes, maintainBrief, parseMaintenanceOptions } from '../src/brief-maintenance'
import { findBriefDuplicates } from '../../shared/brief-maintenance'
import type { MaintenancePreview } from '../../shared/brief-maintenance'
import { dirname, join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { NovelLibrary } from '../src/lib/library'
import type { EpisodeStore } from '../src/lib/store'
import type { NovelRef, NovelRecord } from '../src/lib/types'
import { LibraryDb } from './db'
import type { NovelQuery, NovelSort, ProgressFilter, UpsertAiModelInput } from './db'
import { initializeTranslation, parseTranslationOptions, selectInitializationEpisodes } from '../src/translation'
import { createAiModelClient, normalizeBaseUrl, OPENCODE_BASE_URL, DEFAULT_AI_RETRY_POLICY } from '../src/ai'
import { EpisodeTranslationService, TranslationBatchError } from './episodeTranslationService'
import type { TranslateEpisodesOptions } from '../../shared/episode-translation'
import { hashEpisodeSource } from '../src/translation-source'
import { AiGenerationError } from '../src/ai-errors'
import type { TranslationTaskEvent } from '../../shared/translation'
import { validateReasoning, type ReasoningDialect, type ReasoningLevel, type ResponseProfile } from '../../shared/ai'

export interface LibraryApiDeps {
  library: NovelLibrary
  store: EpisodeStore
  db: LibraryDb
  auditLogPath: string
  novelsDir: string
  episodesDir: string
  parseRange: (spec: string) => number[]
  /** 识别输入属于哪个站点；无法识别返回 null */
  detectSite: (input: string) => string | null
  /** 从磁盘重建索引 */
  syncFromDisk: () => Promise<{ novels: number; episodes: number }>
  defaultConcurrency: number
}

function requestCancellation(req: IncomingMessage, res: ServerResponse) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const onClose = () => { if (!res.writableEnded) abort() }
  req.once('aborted', abort)
  res.once('close', onClose)
  if (req.aborted || res.destroyed) abort()
  return {
    signal: controller.signal,
    dispose: () => { req.off('aborted', abort); res.off('close', onClose) },
  }
}

function modelFailureStatus(error: unknown): number {
  if (!(error instanceof AiGenerationError)) return 400
  if (error.kind === 'rate-limit') return 429
  if (error.kind === 'timeout') return 504
  if (error.kind === 'cancelled') return 499
  if (error.kind === 'rejected' || error.kind === 'refusal') return 400
  return 502
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (res.destroyed || res.writableEnded) return
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

/**
 * 删除类操作的审计日志。
 *
 * 回收站状态只存在 DB 里（磁盘上没有对应文件），一旦索引被外部清掉就无从追溯。
 * 这里按行追加 JSONL，便于事后确认「是谁、什么时候」改了状态。
 */
async function audit(auditLogPath: string, action: string, detail: Record<string, unknown>): Promise<void> {
  const line = `${JSON.stringify({ at: new Date().toISOString(), action, ...detail })}\n`
  try {
    await mkdir(dirname(auditLogPath), { recursive: true })
    await appendFile(auditLogPath, line, 'utf8')
  } catch {
    // 审计失败不影响主流程
  }
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function readCatalogFile(novelsDir: string, site: string, novelId: string): Promise<NovelRecord | null> {
  try {
    const raw = await readFile(join(novelsDir, site, `${novelId}.json`), 'utf8')
    return JSON.parse(raw) as NovelRecord
  } catch {
    return null
  }
}


function normalizeAiModel(body: Record<string, unknown>, id?: number): UpsertAiModelInput {
  const name = String(body.name ?? '').trim()
  const provider = String(body.provider ?? 'openai-compatible').trim()
  const baseUrl = normalizeBaseUrl(String(body.baseUrl ?? '').trim() || (provider === 'opencode' ? OPENCODE_BASE_URL : 'https://api.openai.com/v1'))
  const model = String(body.model ?? '').trim()
  const apiType = body.apiType === 'chat-completions' ? 'chat-completions' : 'responses'
  const reasoningDialect = String(body.reasoningDialect ?? 'none') as ReasoningDialect
  const reasoningLevel = String(body.reasoningLevel ?? 'default') as ReasoningLevel
  validateReasoning(reasoningDialect, reasoningLevel)
  const responseProfile = String(body.responseProfile ?? 'auto') as ResponseProfile
  if (!['auto', 'generic', 'deepseek', 'off'].includes(responseProfile)) throw new Error('响应适配方式无效')
  const extraBody = body.extraBody ?? {}
  if (typeof extraBody !== 'object' || extraBody === null || Array.isArray(extraBody)) throw new Error('扩展请求参数必须为 JSON 对象')
  if (!name || !baseUrl || !model) throw new Error('模型名称、Base URL 和模型名称不能为空')
  const headers = typeof body.headers === 'object' && body.headers !== null ? body.headers as Record<string, string> : {}
  const numberValue = (value: unknown, fallback: number): number => {
    const n = value ?? fallback
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n <= 0) throw new Error('Token 上限必须是正整数')
    return n
  }
  if (body.apiType !== 'responses' && body.apiType !== 'chat-completions') throw new Error('API 协议无效')
  if (provider === 'opencode' && !String(body.apiKey ?? '').trim()) throw new Error('OpenCode 需要 API Key')
  const endpoint = new URL(baseUrl)
  if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('Base URL 必须使用 HTTP 或 HTTPS')
  if (Array.isArray(headers) || Object.values(headers).some((value) => typeof value !== 'string')) throw new Error('请求头必须是字符串键值对象')
  for (const [key, value] of Object.entries(headers)) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) || /[\r\n]/.test(value)) throw new Error('请求头名称或值无效')
  }
  return {
    id, name, provider, apiType, reasoningDialect, reasoningLevel, responseProfile, extraBody: extraBody as Record<string, unknown>, baseUrl, apiKey: String(body.apiKey ?? ''), model,
    windowTokens: numberValue(body.windowTokens, 1050000), inputTokens: numberValue(body.inputTokens, 922000), outputTokens: numberValue(body.outputTokens, 128000),
    headers, enabled: body.enabled !== false,
  }
}

export function createLibraryApiHandler(deps: LibraryApiDeps) {
  const { library, store, db, auditLogPath, novelsDir, episodesDir, parseRange, detectSite, syncFromDisk, defaultConcurrency } = deps

  /**
   * 下载任务的内存进度表。
   *
   * 为什么不靠 DB 统计：`has_content` 只有在每话落盘后才有值，
   * 而「本次任务计划多少话、已完成多少」是任务级信息，DB 里没有。
   * 进程重启会丢，但那时任务也中止了，正好一致。
   */
  interface DownloadJob {
    activeIndices: number[]
    stopping: boolean
    cancelled: boolean
    total: number
    done: number
    failed: number
    running: boolean
    startedAt: number
    finishedAt: number | null
  }
  const jobs = new Map<string, DownloadJob>()
  const downloadControllers = new Map<string, AbortController>()
  const initializationJobs = new Set<string>()
  const episodeTranslations = new EpisodeTranslationService(db, store, initializationJobs)

  const readCatalog = (site: string, novelId: string) => readCatalogFile(novelsDir, site, novelId)

  return async function handle(req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const segments = url.pathname.split('/').filter(Boolean)
    const method = req.method ?? 'GET'

    try {

      if (segments.length === 2 && segments[0] === 'settings' && segments[1] === 'models' && method === 'GET') {
        sendJson(res, 200, db.listAiModels())
        return
      }

      if (segments.length === 2 && segments[0] === 'settings' && segments[1] === 'models' && method === 'POST') {
        const body = await readBody(req)
        try {
          sendJson(res, 201, db.upsertAiModel(normalizeAiModel(body)))
        } catch (err) {
          sendJson(res, 400, { error: err instanceof Error ? err.message : '配置无效' })
        }
        return
      }

      if (segments.length === 3 && segments[0] === 'settings' && segments[1] === 'models' && (method === 'GET' || method === 'PUT')) {
        const id = Number(segments[2])
        if (!Number.isSafeInteger(id) || id <= 0) { sendJson(res, 400, { error: '模型 ID 无效' }); return }
        const existing = db.getAiModel(id)
        if (!existing) { sendJson(res, 404, { error: '模型不存在' }); return }
        if (method === 'GET') { sendJson(res, 200, existing); return }
        const body = await readBody(req)
        try {
          sendJson(res, 200, db.upsertAiModel(normalizeAiModel(body, id)))
        } catch (err) {
          sendJson(res, 400, { error: err instanceof Error ? err.message : '配置无效' })
        }
        return
      }

      if (segments.length === 3 && segments[0] === 'settings' && segments[1] === 'models' && method === 'DELETE') {
        if (!db.deleteAiModel(Number(segments[2]))) {
          sendJson(res, 404, { error: '模型不存在' })
          return
        }
        sendJson(res, 200, { ok: true })
        return
      }

      if (segments.length === 4 && segments[0] === 'settings' && segments[1] === 'models' && segments[3] === 'test' && method === 'POST') {
        const model = db.getAiModel(Number(segments[2]))
        if (!model) { sendJson(res, 404, { error: '模型不存在' }); return }
        const body = await readBody(req)
        const cancellation = requestCancellation(req, res)
        try {
          const result = await createAiModelClient(model).generate({
            system: typeof body.system === 'string' ? body.system : undefined,
            prompt: typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt : '请回复：连接成功',
            temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
            maxTokens: typeof body.maxTokens === 'number' ? body.maxTokens : undefined,
            signal: cancellation.signal,
          })
          sendJson(res, 200, result)
        } catch (err) {
          sendJson(res, modelFailureStatus(err), { error: err instanceof Error ? err.message : '模型调用失败' })
        } finally { cancellation.dispose() }
        return
      }

      if (segments[0] === 'library' && segments.length === 4 && segments[3] === 'reading' && (method === 'GET' || method === 'PUT')) {
        const site = segments[1]!, novelId = segments[2]!
        if (!db.hasNovel(site, novelId)) { sendJson(res, 404, { error: '作品不存在' }); return }
        if (method === 'GET') { sendJson(res, 200, db.readingProgress(site, novelId)); return }
        if (db.isTrashed(site, novelId)) { sendJson(res, 409, { error: '请先恢复本书' }); return }
        try { sendJson(res, 200, db.updateReading(site, novelId, await readBody(req) as UpdateReading)) }
        catch (error) { sendJson(res, 400, { error: error instanceof Error ? error.message : '阅读状态修改失败' }) }
        return
      }

      if (segments[0] === 'library' && segments[3] === 'translation' && segments[4] === 'maintenance' && (segments.length === 5 || segments.length === 6)) {
        const site = segments[1]!
        const novelId = segments[2]!
        const key = JSON.stringify([site, novelId])
        const current = db.getTranslationInitialization(site, novelId)
        if (!current) { sendJson(res, 409, { error: '请先初始化翻译材料' }); return }
        if (method === 'GET' && segments.length === 5) {
          sendJson(res, 200, { baseHash: briefHash(current.result), bytes: briefBytes(current.result), duplicates: findBriefDuplicates(current.result), revisions: db.listBriefRevisions(site, novelId) }); return
        }
        if (method === 'POST') {
          if (initializationJobs.has(key)) { sendJson(res, 409, { error: '本书正在翻译或维护材料，请完成或停止后再操作' }); return }
          if (db.isTrashed(site, novelId)) { sendJson(res, 409, { error: '请先恢复本书' }); return }
          initializationJobs.add(key)
          const cancellation = requestCancellation(req, res)
          let heartbeat: ReturnType<typeof setInterval> | undefined
          let attempts = 0
          const emit = (event: TranslationTaskEvent) => {
            if (res.destroyed || res.writableEnded) return
            if (res.writableLength > 4 * 1024 * 1024) { res.destroy(); return }
            res.write(JSON.stringify(event) + '\n')
          }
          try {
            const body = await readBody(req)
            // Refresh after acquiring the book lock: queued request bodies must not overwrite a newer baseline.
            const baseline = db.getTranslationInitialization(site, novelId)!
            if (segments[5] === 'apply') {
              if (typeof body.previewId !== 'string') throw new Error('预览 ID 无效')
              sendJson(res, 200, db.applyMaintenancePreview(site, novelId, body.previewId)); return
            }
            if (segments[5] === 'restore') {
              if (!Number.isSafeInteger(body.revisionId) || typeof body.baseHash !== 'string') throw new Error('历史版本选项无效')
              sendJson(res, 200, db.restoreBriefRevision(site, novelId, Number(body.revisionId), body.baseHash)); return
            }
            if (segments[5] !== 'preview') { sendJson(res, 404, { error: '接口不存在' }); return }
            const options = parseMaintenanceOptions(body)
            if (options.baseHash !== briefHash(baseline.result)) { sendJson(res, 409, { error: '材料已更新，请重新读取后再操作' }); return }
            const model = db.getAiModel(options.modelId)
            if (!model?.enabled) throw new Error('模型不存在或未启用')
            const record = await readCatalog(site, novelId)
            if (!record) throw new Error('作品目录不存在')
            res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' }); res.flushHeaders()
            emit({ type: 'started', at: Date.now(), limits: { totalTimeoutMs: DEFAULT_AI_RETRY_POLICY.totalTimeoutMs, idleTimeoutMs: DEFAULT_AI_RETRY_POLICY.requestTimeoutMs }, modelName: model.name, model: model.model, apiType: model.apiType, reasoningLevel: options.reasoningLevel ?? model.reasoningLevel, episodeCount: 0 })
            heartbeat = setInterval(() => emit({ type: 'heartbeat', at: Date.now() }), 10000); heartbeat.unref()
            const maintained = await maintainBrief(baseline.result, options, record, model, cancellation.signal, (event) => { if (event.type === 'attempt') attempts = event.attempt; emit(event) })
            cancellation.signal.throwIfAborted()
            const preview: MaintenancePreview = { id: randomUUID(), mode: options.mode, baseHash: options.baseHash, createdAt: new Date().toISOString(), beforeBytes: briefBytes(baseline.result), afterBytes: briefBytes(maintained.result), ...maintained, modelName: model.name }
            db.saveMaintenancePreview(site, novelId, preview)
            emit({ type: 'maintenance-preview', at: Date.now(), preview }); res.end()
          } catch (error) {
            const message = error instanceof Error ? error.message : '材料维护失败'
            if (res.headersSent) { emit({ type: 'error', message, attempts, at: Date.now() }); if (!res.destroyed && !res.writableEnded) res.end() }
            else sendJson(res, modelFailureStatus(error), { error: message })
          } finally { if (heartbeat) clearInterval(heartbeat); cancellation.dispose(); initializationJobs.delete(key) }
          return
        }
      }

      if (segments[0] === 'library' && segments[3] === 'translation' && segments[4] === 'episodes' && (segments.length === 5 || segments.length === 6 && segments[5] === 'stop')) {
        const site = segments[1]!
        const novelId = segments[2]!
        try {
          if (method === 'GET' && segments.length === 5) { sendJson(res, 200, episodeTranslations.snapshot(site, novelId)); return }
          if (method === 'POST' && segments[5] === 'stop') { episodeTranslations.stop(site, novelId); sendJson(res, 200, episodeTranslations.snapshot(site, novelId)); return }
          if (method === 'POST' && segments.length === 5) {
            const record = await readCatalog(site, novelId)
            if (!record) { sendJson(res, 404, { error: '作品不存在' }); return }
            if (jobs.get(`${site}/${novelId}`)?.running) { sendJson(res, 409, { error: '本书正在下载正文，请下载完成后再翻译' }); return }
            const options = await readBody(req) as unknown as TranslateEpisodesOptions
            episodeTranslations.start(record, options)
            sendJson(res, 202, episodeTranslations.snapshot(site, novelId)); return
          }
        } catch (error) { sendJson(res, error instanceof TranslationBatchError ? error.status : 400, { error: error instanceof Error ? error.message : '章节翻译任务失败' }); return }
      }

      if (segments.length === 5 && segments[0] === 'library' && segments[3] === 'translation' && segments[4] === 'initialize') {
        const site = segments[1]
        const novelId = segments[2]
        if (method === 'GET') {
          sendJson(res, 200, db.getTranslationInitialization(site, novelId))
          return
        }
        if (method === 'POST') {
          const key = JSON.stringify([site, novelId])
          if (jobs.get(`${site}/${novelId}`)?.running) { sendJson(res, 409, { error: '本书正在下载正文，请下载完成后再初始化' }); return }
          if (initializationJobs.has(key)) { sendJson(res, 409, { error: '这本书的翻译概要正在生成，请勿重复提交' }); return }
          initializationJobs.add(key)
          const cancellation = requestCancellation(req, res)
          const streaming = req.headers.accept?.includes('application/x-ndjson') ?? false
          let heartbeat: ReturnType<typeof setInterval> | undefined
          let attempts = 0
          const emit = (event: TranslationTaskEvent) => {
            if (res.destroyed || res.writableEnded) return
            // Bound memory if the browser stops consuming output.
            if (res.writableLength > 4 * 1024 * 1024) { res.destroy(); return }
            res.write(JSON.stringify(event) + '\n')
          }
          try {
            const body = await readBody(req)
            const options = parseTranslationOptions(body)
            const model = db.getAiModel(options.modelId)
            if (!model || !model.enabled) { sendJson(res, 400, { error: '模型不存在或未启用' }); return }
            const record = await readCatalog(site, novelId)
            if (!record) { sendJson(res, 404, { error: '作品目录不存在' }); return }
            if (db.isTrashed(site, novelId)) { sendJson(res, 409, { error: '请先从回收站恢复作品' }); return }
            const selected = selectInitializationEpisodes(record, options.chapterCount)
            if (streaming) {
              res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' })
              res.flushHeaders()
              emit({ type: 'started', at: Date.now(), limits: { totalTimeoutMs: DEFAULT_AI_RETRY_POLICY.totalTimeoutMs, idleTimeoutMs: DEFAULT_AI_RETRY_POLICY.requestTimeoutMs }, modelName: model.name, model: model.model, apiType: model.apiType, reasoningLevel: options.reasoningLevel ?? model.reasoningLevel, episodeCount: selected.length })
              emit({ type: 'phase', phase: 'reading', at: Date.now() })
              heartbeat = setInterval(() => emit({ type: 'heartbeat', at: Date.now() }), 10000)
              heartbeat.unref()
            }
            const contents = []
            for (const episode of selected) {
              const content = await store.read({ site, novelId, canonicalUrl: record.source.url, variant: null }, episode.index)
              if (!content || !content.body.trim()) {
                const message = `第 ${episode.index} 话尚未下载或正文为空，请先下载该范围`
                if (streaming) { emit({ type: 'error', message, attempts, at: Date.now() }); res.end() }
                else sendJson(res, 409, { error: message })
                return
              }
              contents.push(content)
            }
            if (streaming) emit({ type: 'phase', phase: 'preparing', at: Date.now() })
            const initialized = await initializeTranslation(record, contents, options, model, cancellation.signal, streaming ? (event) => {
              if (event.type === 'attempt') attempts = event.attempt
              emit(event)
            } : undefined)
            cancellation.signal.throwIfAborted()
            if (streaming) emit({ type: 'phase', phase: 'saving', at: Date.now() })
            const saved = db.saveTranslationInitialization({ site, novelId, modelId: model.id, request: initialized.request, result: initialized.result })
            if (streaming) { emit({ type: 'completed', saved, at: Date.now() }); res.end() }
            else sendJson(res, 200, saved)
          } catch (err) {
            const message = err instanceof Error ? err.message : '初始化翻译材料失败'
            if (res.headersSent) {
              emit({ type: 'error', message, attempts, at: Date.now() })
              if (!res.destroyed && !res.writableEnded) res.end()
            } else sendJson(res, modelFailureStatus(err), { error: message })
          } finally {
            if (heartbeat) clearInterval(heartbeat)
            cancellation.dispose()
            initializationJobs.delete(key)
          }
          return
        }
      }

      if (segments.length === 1 && segments[0] === 'sites' && method === 'GET') {
        sendJson(res, 200, library.sites)
        return
      }

      if (segments.length === 1 && segments[0] === 'stats' && method === 'GET') {
        sendJson(res, 200, db.stats())
        return
      }

      // GET /api/facets —— 分类统计（状态 / 站点 / 题材 / 标签）
      if (segments.length === 1 && segments[0] === 'facets' && method === 'GET') {
        sendJson(res, 200, db.facets())
        return
      }

      // GET /api/library?q=&site=&status=&genre=&tag=&progress=&sort=&page=&limit=&trashed=1
      if (segments.length === 1 && segments[0] === 'library' && method === 'GET') {
        const read = (key: string): string | undefined => url.searchParams.get(key)?.trim() || undefined
        const page = Math.max(1, Number(read('page') ?? 1) || 1)
        const limit = Math.min(Math.max(Number(read('limit') ?? 60) || 60, 1), 200)

        const query: NovelQuery = {
          q: read('q'),
          site: read('site'),
          status: read('status'),
          genre: read('genre'),
          tag: read('tag'),
          progress: (read('progress') as ProgressFilter | undefined) ?? undefined,
          readingProgress: read('readingProgress') as ReadingProgressFilter | undefined,
          sort: (read('sort') as NovelSort | undefined) ?? undefined,
          trashed: read('trashed') === '1',
          limit,
          offset: (page - 1) * limit,
        }

        const result = db.listNovels(query)
        sendJson(res, 200, { ...result, page, limit })
        return
      }

      // POST /api/trash/empty —— 清空回收站（永久删除所有回收站作品及其文件）
      if (segments.length === 2 && segments[0] === 'trash' && segments[1] === 'empty' && method === 'POST') {
        const trashed = db.listNovels({ trashed: true, limit: 100000 }).items
        if (trashed.some((item) => initializationJobs.has(JSON.stringify([item.site, item.novelId])))) { sendJson(res, 409, { error: '回收站中有正在翻译的作品，请先停止任务' }); return }
        const removed = db.purgeAllTrashed()
        for (const item of removed) {
          await rm(join(novelsDir, item.site, `${item.novelId}.json`), { force: true })
          await rm(join(episodesDir, item.site, item.novelId), { recursive: true, force: true })
        }
        await audit(auditLogPath, 'empty-trash', { removed: removed.map((item) => `${item.site}/${item.novelId}`) })
        sendJson(res, 200, { removed: removed.length, stats: db.stats() })
        return
      }

      // POST /api/sync —— 从磁盘重建索引
      if (segments.length === 1 && segments[0] === 'sync' && method === 'POST') {
        if (initializationJobs.size || [...jobs.values()].some((job) => job.running)) { sendJson(res, 409, { error: '翻译或抓取任务执行中，完成或停止后再同步数据' }); return }
        const result = await syncFromDisk()
        sendJson(res, 200, { ...result, stats: db.stats() })
        return
      }

      // POST /api/import  { input, site? }
      if (segments.length === 1 && segments[0] === 'import' && method === 'POST') {
        const body = await readBody(req)
        const input = String(body.input ?? '').trim()
        const site = String(body.site ?? '').trim()
        if (!input) {
          sendJson(res, 400, { error: '缺少 input 参数' })
          return
        }

        const detected = detectSite(input)
        if (!detected) {
          sendJson(res, 400, { error: '无法识别该地址所属站点' })
          return
        }
        if (site && site !== detected) {
          sendJson(res, 400, { error: `该地址属于「${detected}」，与所选数据来源「${site}」不一致` })
          return
        }

        const record = await library.fetchCatalog(input)
        const target = join(novelsDir, record.source.site, `${record.source.novelId}.json`)
        await mkdir(join(novelsDir, record.source.site), { recursive: true })
        await writeFile(target, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
        db.upsertCatalog(record)
        sendJson(res, 200, record)
        return
      }

      if (segments[0] === 'library' && segments.length >= 3) {
        const site = segments[1]
        const novelId = segments[2]
        const ref: NovelRef = { site, novelId, canonicalUrl: '', variant: null }

        if (segments.length === 3 && method === 'GET') {
          const record = await readCatalog(site, novelId)
          if (!record) {
            // 索引里有记录但文件不在：明确告诉前端「可以重新抓」，而不是笼统的 404
            const known = db.hasNovel(site, novelId)
            sendJson(
              res,
              known ? 409 : 404,
              { error: known ? '目录文件缺失，请重新抓取目录' : '作品不存在' },
            )
            return
          }
          sendJson(res, 200, record)
          return
        }

        // DELETE /api/library/:site/:id            → 一级删除：移入回收站
        // DELETE /api/library/:site/:id?permanent=1 → 二级删除：连文件一起永久删除
        if (segments.length === 3 && method === 'DELETE') {
          const permanent = url.searchParams.get('permanent') === '1'
          if (initializationJobs.has(JSON.stringify([site, novelId])) || jobs.get(`${site}/${novelId}`)?.running) { sendJson(res, 409, { error: '本书正在翻译或抓取，请先停止任务后再删除' }); return }

          if (!permanent) {
            if (!db.trashNovel(site, novelId)) {
              sendJson(res, 404, { error: '作品不存在或已在回收站' })
              return
            }
            await audit(auditLogPath, 'trash', { site, novelId })
            sendJson(res, 200, { ok: true, mode: 'trash' })
            return
          }

          if (!db.hasNovel(site, novelId)) {
            sendJson(res, 404, { error: '作品不存在' })
            return
          }
          await rm(join(novelsDir, site, `${novelId}.json`), { force: true })
          await rm(join(episodesDir, site, novelId), { recursive: true, force: true })
          db.purgeNovel(site, novelId)
          await audit(auditLogPath, 'purge', { site, novelId })
          sendJson(res, 200, { ok: true, mode: 'purge' })
          return
        }

        // POST /api/library/:site/:id/restore —— 从回收站恢复
        if (segments[3] === 'restore' && method === 'POST') {
          if (!db.restoreNovel(site, novelId)) {
            sendJson(res, 404, { error: '作品不在回收站中' })
            return
          }
          await audit(auditLogPath, 'restore', { site, novelId })
          sendJson(res, 200, { ok: true })
          return
        }

        // POST /api/library/:site/:id/refresh —— 重新抓取目录（更新元数据与话列表）
        if (segments[3] === 'refresh' && method === 'POST') {
          const current = await readCatalog(site, novelId)
          // 目录 JSON 丢失时回退到索引里记录的原始地址，避免「文件没了就彻底救不回来」
          const sourceUrl = current?.source.url ?? db.getSourceUrl(site, novelId)
          if (!sourceUrl) {
            sendJson(res, 404, { error: '作品不存在' })
            return
          }
          const record = await library.fetchCatalog(sourceUrl)
          await mkdir(join(novelsDir, site), { recursive: true })
          await writeFile(
            join(novelsDir, site, `${novelId}.json`),
            `${JSON.stringify(record, null, 2)}\n`,
            'utf8',
          )
          const rowId = db.upsertCatalog(record)
          db.setContentFlags(rowId, await store.list(ref))
          sendJson(res, 200, record)
          return
        }

        // GET /api/library/:site/:id/status
        if (segments[3] === 'status' && method === 'GET') {
          const record = await readCatalog(site, novelId)
          const downloaded = db.contentFlags(site, novelId)
          sendJson(res, 200, {
            downloaded: downloaded.length,
            total: record?.episodes.length ?? 0,
            indices: downloaded,
            job: jobs.get(`${site}/${novelId}`) ?? null,
          })
          return
        }

        // GET /api/library/:site/:id/episodes/:index
        if (segments[3] === 'episodes' && segments.length === 5 && method === 'GET') {
          const content = await store.read(ref, Number(segments[4]))
          if (!content) {
            sendJson(res, 404, { error: '该话尚未下载' })
            return
          }
          sendJson(res, 200, content.translation ? { ...content, translation: { ...content.translation, stale: content.translation.sourceHash !== hashEpisodeSource(content) } } : content)
          return
        }

        if (segments[3] === 'fetch' && segments[4] === 'stop' && segments.length === 5 && method === 'POST') {
          const job = jobs.get(`${site}/${novelId}`)
          if (job?.running) { job.stopping = true; downloadControllers.get(`${site}/${novelId}`)?.abort() }
          sendJson(res, 200, { job: job ?? null })
          return
        }

        // POST /api/library/:site/:id/fetch  { range?, all?, overwrite?, concurrency? }
        if (segments[3] === 'fetch' && segments.length === 4 && method === 'POST') {
          if (initializationJobs.has(JSON.stringify([site, novelId]))) { sendJson(res, 409, { error: '本书正在翻译，请先停止任务后再更新正文' }); return }
          const body = await readBody(req)
          const record = await readCatalog(site, novelId)
          if (!record) {
            sendJson(res, 404, { error: '作品不存在，请先导入' })
            return
          }
          if (db.isTrashed(site, novelId)) {
            sendJson(res, 409, { error: '作品在回收站中，请先恢复后再下载' })
            return
          }

          const range = typeof body.range === 'string' && body.range.trim() ? body.range : undefined
          const all = body.all === true
          const overwrite = body.overwrite === true
          const concurrency = Number(body.concurrency ?? defaultConcurrency)

          let indices: number[] | undefined
          if (range) {
            try {
              indices = parseRange(range)
            } catch (err) {
              sendJson(res, 400, { error: err instanceof Error ? err.message : '区间格式错误' })
              return
            }
          } else if (!all) {
            // 默认：只补缺失的话（用索引查，不扫文件）
            const have = new Set(db.contentFlags(site, novelId))
            indices = record.episodes.map((episode) => episode.index).filter((i) => !have.has(i))
          }

          const jobKey = `${site}/${novelId}`
          const existing = jobs.get(jobKey)
          if (existing?.running) {
            sendJson(res, 409, { error: '该作品已有下载任务在进行中' })
            return
          }

          const controller = new AbortController()
          downloadControllers.set(jobKey, controller)
          jobs.set(jobKey, {
            activeIndices: [], stopping: false, cancelled: false,
            total: indices?.length ?? record.episodes.length,
            done: 0,
            failed: 0,
            running: true,
            startedAt: Date.now(),
            finishedAt: null,
          })

          try {
          const result = await library.downloadEpisodes(record.source.url, {
            indices: indices ?? record.episodes.map((episode) => episode.index),
            signal: controller.signal,
            overwrite,
            concurrency,
            onEpisodeState: (index, active) => {
              const job = jobs.get(jobKey)
              if (job) job.activeIndices = active ? [...new Set([...job.activeIndices, index])] : job.activeIndices.filter((value) => value !== index)
            },
            // 每抓完一话立刻写索引：否则 /status 在整批结束前都返回旧值，
            // 前端轮询拿不到任何变化，进度条等于不动。
            onEpisode: (content) => {
              const job = jobs.get(jobKey)
              if (job) job.done += 1
              const rowId = db.findId(site, novelId)
              if (rowId !== null) db.markContent(site, novelId, [content.index])
              db.invalidateEpisodeTranslation(site, novelId, content.index, hashEpisodeSource(content))
            },
          })

          // 用磁盘真实状态回写索引，修正增量标记的偏差（例如中断、手动删文件）
          const novelRowId = db.findId(site, novelId)
          if (novelRowId !== null) db.setContentFlags(novelRowId, await store.list(ref))

          const job = jobs.get(jobKey)
          if (job) {
            job.running = false
            job.failed = result.failed.length
            job.finishedAt = Date.now()
          }

          sendJson(res, 200, {
            total: result.total,
            fetched: result.fetched,
            skipped: result.skipped,
            failed: result.failed,
            durationMs: result.durationMs,
            manifest: result.manifest,
            cancelled: controller.signal.aborted,
          })
          } finally {
            const job = jobs.get(jobKey)
            if (job) { job.running = false; job.stopping = false; job.cancelled = controller.signal.aborted; job.activeIndices = []; job.finishedAt = Date.now() }
            downloadControllers.delete(jobKey)
          }
          return
        }
      }

      next()
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
    }
  }
}

