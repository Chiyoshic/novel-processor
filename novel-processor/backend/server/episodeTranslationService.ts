import { DEFAULT_AI_RETRY_POLICY } from '../src/ai'
import { randomUUID } from 'node:crypto'
import type { EpisodeStore } from '../src/lib/store'
import type { NovelRecord } from '../src/lib/types'
import type { AiModelConfig, LibraryDb } from './db'
import type { TranslateEpisodesOptions, EpisodeTranslationStatus, TranslationBatchJob, EpisodeTranslationsResponse, TranslationStyleReference } from '../../shared/episode-translation'
import type { AiProgressEvent } from '../../shared/ai-task'
import { validateReasoning } from '../../shared/ai'
import { hashEpisodeSource } from '../src/translation-source'
import { EPISODE_TRANSLATION_PROMPT_VERSION, translateEpisode } from '../src/episode-translation'
import { applyBriefOperations } from '../src/translation-patches'

export class TranslationBatchError extends Error {
  readonly status: number
  constructor(message: string, status = 400) { super(message); this.status = status }
}
export class EpisodeTranslationService {
  private readonly db: LibraryDb
  private readonly store: EpisodeStore
  private readonly locks: Set<string>
  private readonly jobs = new Map<string, TranslationBatchJob>()
  private readonly controllers = new Map<string, AbortController>()
  constructor(db: LibraryDb, store: EpisodeStore, locks: Set<string>) { this.db = db; this.store = store; this.locks = locks }
  snapshot(site: string, novelId: string): EpisodeTranslationsResponse {
    return { episodes: this.db.listEpisodeTranslations(site, novelId), job: this.jobs.get(JSON.stringify([site, novelId])) ?? null }
  }
  stop(site: string, novelId: string): void {
    const key = JSON.stringify([site, novelId])
    const job = this.jobs.get(key)
    if (job?.running) { job.stopping = true; this.controllers.get(key)?.abort() }
  }
  start(record: NovelRecord, options: TranslateEpisodesOptions): TranslationBatchJob {
    const { site, novelId } = record.source
    const key = JSON.stringify([site, novelId])
    if (this.locks.has(key)) throw new TranslationBatchError('本书已有翻译或初始化任务，请等待完成或先停止任务', 409)
    if (!this.db.getTranslationInitialization(site, novelId)) throw new TranslationBatchError('请先完成第一步：初始化翻译材料', 409)
    if (this.db.isTrashed(site, novelId)) throw new TranslationBatchError('请先从回收站恢复本书', 409)
    if (!Number.isSafeInteger(options.modelId) || !Array.isArray(options.indices) || !options.indices.length || options.indices.length > 1000 || options.indices.some((index) => !Number.isSafeInteger(index) || index < 1)) throw new TranslationBatchError('请选择 1–1000 话')
    const selected = new Set(options.indices)
    if ([...selected].some((index) => !record.episodes.some((episode) => episode.index === index))) throw new TranslationBatchError('选择中包含目录不存在的话序号')
    if (typeof options.overwrite !== 'boolean' || typeof options.requirements !== 'string' || options.requirements.length > 10000) throw new TranslationBatchError('翻译选项无效，附加要求最多 10000 字')
    const model = this.db.getAiModel(options.modelId)
    if (!model?.enabled) throw new TranslationBatchError('模型不存在或未启用')
    validateReasoning(model.reasoningDialect, options.reasoningLevel ?? model.reasoningLevel)
    const indices = record.episodes.filter((episode) => selected.has(episode.index)).map((episode) => episode.index)
    const job: TranslationBatchJob = { id: randomUUID(), limits: { totalTimeoutMs: DEFAULT_AI_RETRY_POLICY.totalTimeoutMs, idleTimeoutMs: DEFAULT_AI_RETRY_POLICY.requestTimeoutMs, maxAttempts: DEFAULT_AI_RETRY_POLICY.maxAttempts }, running: true, stopping: false, startedAt: Date.now(), finishedAt: null, modelName: model.name, model: model.model, apiType: model.apiType, reasoningLevel: options.reasoningLevel ?? model.reasoningLevel, indices, done: [], failed: [], skipped: [], cancelled: [], current: null }
    const controller = new AbortController()
    this.locks.add(key)
    this.controllers.set(key, controller)
    this.jobs.set(key, job)
    // Keep only a small number of completed snapshots; persisted per-episode state is authoritative.
    for (const [oldKey, previous] of this.jobs) if (this.jobs.size > 20 && !previous.running && oldKey !== key) this.jobs.delete(oldKey)
    try {
      for (const index of indices) this.setState(site, novelId, index, { status: 'queued', modelName: model.name, error: null })
    } catch (error) { this.locks.delete(key); this.controllers.delete(key); this.jobs.delete(key); throw error }
    void this.run(record, options, model, job, controller).catch((error) => {
      // Unexpected infrastructure errors must not leave queued rows or a book lock behind.
      console.error('[episode-translation] batch failed', error instanceof Error ? error.message : 'unknown error')
    })
    return job
  }
  private setState(site: string, novelId: string, index: number, update: Partial<EpisodeTranslationStatus>): EpisodeTranslationStatus {
    const previous = this.db.listEpisodeTranslations(site, novelId).find((item) => item.index === index)
    const result: EpisodeTranslationStatus = { site, novelId, index, status: 'queued', hasTranslation: false, translatedAt: null, updatedAt: new Date().toISOString(), modelName: '', sourceHash: '', attempts: 0, error: null, warnings: [], updates: [], ...previous, ...update }
    result.updatedAt = new Date().toISOString()
    this.db.saveEpisodeTranslation(result)
    return result
  }
  private async styleReference(record: NovelRecord, index: number): Promise<TranslationStyleReference | undefined> {
    const position = record.episodes.findIndex((episode) => episode.index === index)
    const candidates = [...record.episodes.slice(0, position).reverse(), ...record.episodes.slice(position + 1)]
    const ref = { site: record.source.site, novelId: record.source.novelId, canonicalUrl: record.source.url, variant: null }
    for (const candidate of candidates) {
      const source = await this.store.read(ref, candidate.index)
      const translation = source?.translation
      if (source && translation?.body.trim() && translation.sourceHash === hashEpisodeSource(source)) return { index: candidate.index, title: translation.title, preface: translation.preface, body: translation.body, afterword: translation.afterword }
    }
    return undefined
  }
  private async run(record: NovelRecord, options: TranslateEpisodesOptions, model: AiModelConfig, job: TranslationBatchJob, controller: AbortController): Promise<void> {
    const { site, novelId } = record.source
    const key = JSON.stringify([site, novelId])
    const ref = { site, novelId, canonicalUrl: record.source.url, variant: null }
    try {
      for (const index of job.indices) {
        if (controller.signal.aborted) break
        job.current = { index, title: record.episodes.find((episode) => episode.index === index)!.title, startedAt: Date.now(), finishedAt: null, lastEventAt: Date.now(), status: 'translating', events: [], warnings: [] }
        let attempts = 0
        const progress = (event: AiProgressEvent) => {
          if (event.type === 'attempt') attempts = event.attempt
          job.current!.lastEventAt = event.at
          const events = job.current!.events
          const last = events.at(-1)
          if (event.type === 'delta' && last?.type === 'delta' && last.attempt === event.attempt) { last.characters = (last.characters ?? last.text.length) + event.text.length; last.text = (last.text + event.text).slice(-120000) }
          else events.push(event)
        }
        try {
          if (this.db.isTrashed(site, novelId)) throw new Error('本书已移入回收站，翻译停止')
          const content = await this.store.read(ref, index)
          if (!content?.body.trim()) throw new Error('本话正文尚未下载或为空，请先下载')
          const sourceHash = hashEpisodeSource(content)
          if (!options.overwrite && content.translation?.body && content.translation.sourceHash === sourceHash) {
            this.setState(site, novelId, index, { status: 'translated', hasTranslation: true, sourceHash, translatedAt: content.translation.translatedAt, modelName: content.translation.modelName, attempts: content.translation.attempts, error: null, warnings: content.translation.warnings, updates: content.translation.updates })
            job.skipped.push(index); job.current.status = 'translated'; continue
          }
          this.setState(site, novelId, index, { status: 'translating', error: null, attempts: 0, warnings: [], updates: [] })
          // Each sequential call receives the latest baseline committed by the previous episode.
          const baseline = this.db.getTranslationInitialization(site, novelId)
          if (!baseline) throw new Error('翻译材料不存在，请先完成初始化')
          const requirements = [baseline.request.requirements, options.requirements].filter(Boolean).join('\n')
          const reference = await this.styleReference(record, index)
          job.current.referenceEpisodeIndex = reference?.index
          controller.signal.throwIfAborted()
          const response = await translateEpisode(record, content, baseline.result, model, requirements, options.reasoningLevel, controller.signal, progress, reference)
          controller.signal.throwIfAborted()
          let patched: ReturnType<typeof applyBriefOperations>
          try { patched = applyBriefOperations(baseline.result, response.value.updates, record) }
          catch { patched = { result: baseline.result, changed: false, reports: [], warnings: ['材料补充处理异常，已忽略；译文正常保存。'] } }
          const latest = await this.store.read(ref, index)
          if (!latest || hashEpisodeSource(latest) !== sourceHash) throw new Error('翻译期间原文已变化，未保存过期译文，请重试本话')
          const translatedAt = new Date().toISOString()
          const translation = { ...response.value.translation, language: 'zh-CN' as const, translatedAt, modelId: model.id, modelName: model.name, model: response.model, sourceHash, ...(reference ? { referenceEpisodeIndex: reference.index } : {}), promptVersion: EPISODE_TRANSLATION_PROMPT_VERSION, runId: job.id, attempts: response.attempts, updates: patched.reports, warnings: patched.warnings }
          const state: EpisodeTranslationStatus = { site, novelId, index, status: 'translated', hasTranslation: true, translatedAt, updatedAt: translatedAt, modelName: model.name, sourceHash, attempts: response.attempts, error: null, updates: patched.reports, warnings: patched.warnings }
          let written = false
          try {
            controller.signal.throwIfAborted()
            await this.store.write(ref, { ...latest, translation })
            written = true
            controller.signal.throwIfAborted()
            this.db.commitEpisodeTranslation(state, baseline, patched.result)
          } catch (error) {
            if (written) await this.store.write(ref, latest, { preserveTranslation: false })
            throw error
          }
          job.current.warnings = patched.warnings
          job.current.status = 'translated'
          job.done.push(index)
        } catch (error) {
          const cancelled = controller.signal.aborted
          const message = cancelled ? '任务已停止，原有译文保留' : error instanceof Error ? error.message : '本话翻译失败'
          this.setState(site, novelId, index, { status: cancelled ? 'cancelled' : 'failed', attempts, error: message })
          job.current.status = cancelled ? 'cancelled' : 'failed'
          if (cancelled) { job.cancelled.push(index); break }
          job.failed.push({ index, error: message })
        } finally { job.current.finishedAt = Date.now() }
      }
    } finally {
      const completed = new Set([...job.done, ...job.failed.map((item) => item.index), ...job.skipped, ...job.cancelled])
      try {
        for (const index of job.indices) if (!completed.has(index)) {
          job.cancelled.push(index)
          this.setState(site, novelId, index, { status: 'cancelled', error: '任务已停止，本话未执行' })
        }
      } finally {
        job.running = false; job.finishedAt = Date.now(); job.stopping = false
        this.controllers.delete(key); this.locks.delete(key)
      }
    }
  }
}
