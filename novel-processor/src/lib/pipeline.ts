/**
 * 抓取流水线（与站点无关）。
 *
 * 职责：
 * 1. 解析输入 → 定位适配器
 * 2. 逐页抓取目录 → 合并有序条目流
 * 3. 分配全书序号、归并「章」
 * 4. 调用站点 API 富化元数据
 * 5. 输出统一的 NovelRecord
 *
 * 站点差异全部下沉到 SiteAdapter，这里不出现任何站点特有逻辑。
 */
import { FetchHttpClient } from './http'
import { NovelError, describeError } from './errors'
import { forEachLimit, mapLimit } from './concurrency'
import { nowIso } from './time'
import type {
  AuthorRef,
  Chapter,
  Episode,
  EpisodeContent,
  FetchProgress,
  HttpClient,
  IndexItem,
  NovelMeta,
  NovelRecord,
  NovelRef,
  SiteAdapter,
} from './types'
import { resolveTarget, builtinAdapters } from './sites/registry'

export const SCHEMA_VERSION = '1.0.0'
export const PARSER_VERSION = '0.1.0'

export interface FetchNovelOptions {
  /** 覆盖默认 HTTP 客户端（例如测试用桩） */
  http?: HttpClient
  /** 最多抓取多少页目录，防止异常站点无限翻页。默认 50 */
  maxPages?: number
  /** 是否调用站点 API 富化元数据。默认 true */
  enrich?: boolean
  /**
   * 并发任务数。默认 1（串行）。
   *
   * 注意：实际吞吐同时受 HttpClient 的 `concurrency` 与 `minIntervalMs` 约束，
   * 两者应配置一致，否则任务会在此层并发、在 IO 层排队。
   */
  concurrency?: number
  /** 取消信号 */
  signal?: AbortSignal
  /** 进度回调 */
  onProgress?: (progress: FetchProgress) => void
}

/** 批量抓取正文的选项。 */
export interface FetchEpisodesOptions extends FetchNovelOptions {
  /** 只抓这些话序号；缺省表示全部（需先抓目录） */
  indices?: number[]
  /** 跳过判定，返回 true 则不抓（断点续传） */
  shouldSkip?: (index: number) => Promise<boolean> | boolean
  /** 每成功抓完一话回调一次，用于即时落盘 */
  onEpisode?: (content: EpisodeContent & { ref: NovelRef }) => Promise<void> | void
}

/** 批量抓取结果。 */
export interface EpisodeBatchResult {
  total: number
  fetched: number
  skipped: number
  failed: Array<{ index: number; error: string }>
  durationMs: number
}

const EMPTY_AUTHOR: AuthorRef = { name: '', url: null, siteUserId: null }

function defaultMeta(): NovelMeta {
  return {
    title: '',
    author: { ...EMPTY_AUTHOR },
    summary: '',
    status: 'unknown',
    statusLabel: null,
    workType: 'unknown',
    episodeCount: null,
    chapterCount: null,
    wordCount: null,
    firstPublishedAt: null,
    lastEpisodeAt: null,
    completedAt: null,
    tags: [],
    genre: null,
    genreCode: null,
    flags: { r15: false, r18: false, zankoku: false, bl: false, gl: false },
    sourceUpdatedAt: null,
  }
}

/** 把有序条目流装配成「章 + 话」，并重排章序号。 */
export function assembleStructure(items: IndexItem[]): { chapters: Chapter[]; episodes: Episode[] } {
  interface DraftChapter {
    title: string
    episodeStart: number
    episodeEnd: number
    episodeCount: number
  }

  const drafts: DraftChapter[] = []
  const episodes: Episode[] = []
  let current: DraftChapter | null = null
  let autoIndex = 0

  for (const item of items) {
    if (item.kind === 'chapter') {
      current = { title: item.title, episodeStart: 0, episodeEnd: 0, episodeCount: 0 }
      drafts.push(current)
      continue
    }

    autoIndex += 1
    const raw = item.episode
    const index = raw.index ?? autoIndex

    episodes.push({
      index,
      title: raw.title,
      url: raw.url,
      path: raw.path,
      chapterIndex: current ? drafts.indexOf(current) + 1 : null,
      chapterTitle: current ? current.title : null,
      publishedAt: raw.publishedAt,
      revisedAt: raw.revisedAt,
      isRevised: raw.isRevised,
    })

    if (current) {
      if (current.episodeCount === 0) current.episodeStart = index
      current.episodeEnd = index
      current.episodeCount += 1
    }
  }

  // 丢掉没有任何话的空章（站点可能存在只有标题没有内容的残留节点）
  const kept = drafts.filter((d) => d.episodeCount > 0)
  const remap = new Map<number, number>()
  kept.forEach((draft, i) => remap.set(drafts.indexOf(draft) + 1, i + 1))

  const chapters: Chapter[] = kept.map((draft, i) => ({
    index: i + 1,
    title: draft.title,
    episodeStart: draft.episodeStart,
    episodeEnd: draft.episodeEnd,
    episodeCount: draft.episodeCount,
  }))

  for (const episode of episodes) {
    if (episode.chapterIndex === null) continue
    episode.chapterIndex = remap.get(episode.chapterIndex) ?? null
  }

  return { chapters, episodes }
}

export class NovelFetcher {
  private readonly adapters: SiteAdapter[]
  private readonly http: HttpClient

  constructor(options: { adapters?: SiteAdapter[]; http?: HttpClient } = {}) {
    this.adapters = options.adapters ?? builtinAdapters
    this.http = options.http ?? new FetchHttpClient()
  }

  /** 解析输入，得到适配器与作品引用。 */
  resolve(input: string): { adapter: SiteAdapter; ref: NovelRef } {
    return resolveTarget(input, this.adapters)
  }

  /** 抓取作品目录，产出完整记录。 */
  async fetchNovel(input: string, options: FetchNovelOptions = {}): Promise<NovelRecord> {
    const startedAt = Date.now()
    const { adapter, ref } = this.resolve(input)
    const http = options.http ?? this.http
    const maxPages = options.maxPages ?? 50
    const concurrency = Math.max(1, Math.floor(options.concurrency ?? 1))
    const warnings: string[] = []
    const enrichedBy: string[] = []

    // ---- 1. 第一页：拿元数据骨架与总页数 ----
    options.onProgress?.({ phase: 'index', page: 1, totalPages: 1, message: '抓取目录第 1 页' })
    const firstHtml = await http.get(adapter.indexUrl(ref, 1), { signal: options.signal })
    const firstPage = adapter.parseIndexPage(firstHtml.body, ref, 1)
    warnings.push(...firstPage.warnings)

    const declaredPages = Math.max(1, firstPage.pagination.totalPages)
    const totalPages = Math.min(declaredPages, maxPages)
    if (declaredPages > maxPages) {
      warnings.push(`总页数 ${declaredPages} 超过上限 ${maxPages}，已截断`)
    }

    const items: IndexItem[] = [...firstPage.items]

    // ---- 2. 其余页：并发抓取，按页序合并（顺序必须保留，否则章会错位） ----
    if (totalPages > 1) {
      const pageNumbers = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
      const parsedPages = await mapLimit(pageNumbers, concurrency, async (page) => {
        options.onProgress?.({
          phase: 'index',
          page,
          totalPages,
          message: `抓取目录第 ${page}/${totalPages} 页`,
        })
        const res = await http.get(adapter.indexUrl(ref, page), { signal: options.signal })
        return adapter.parseIndexPage(res.body, ref, page)
      })

      // mapLimit 保序，直接按序追加即可
      for (const parsed of parsedPages) {
        items.push(...parsed.items)
        warnings.push(...parsed.warnings)
      }
    }

    // ---- 3. 装配结构 ----
    const { chapters, episodes } = assembleStructure(items)

    const seen = new Set<number>()
    for (const episode of episodes) {
      if (seen.has(episode.index)) warnings.push(`话序号重复：${episode.index}（${episode.url}）`)
      seen.add(episode.index)
    }
    for (let i = 1; i <= episodes.length; i++) {
      if (!seen.has(i)) {
        warnings.push(`话序号不连续：缺少第 ${i} 话`)
        break
      }
    }

    // ---- 4. 元数据组装与富化 ----
    let meta: NovelMeta = { ...defaultMeta(), ...stripUndefined(firstPage.meta) }
    meta.author = { ...EMPTY_AUTHOR, ...(firstPage.meta.author ?? {}) }
    meta.episodeCount = episodes.length
    meta.chapterCount = chapters.length

    if (options.enrich !== false && adapter.fetchMeta) {
      options.onProgress?.({ phase: 'enrich', page: 0, totalPages: 0, message: '调用站点 API 补全元数据' })
      const apiMeta = await adapter.fetchMeta(ref, http)
      if (apiMeta) {
        meta = { ...meta, ...stripUndefined(apiMeta) }
        meta.author = { ...EMPTY_AUTHOR, ...(firstPage.meta.author ?? {}), ...(apiMeta.author ?? {}) }
        enrichedBy.push(`${adapter.id}-api`)
        if (apiMeta.episodeCount != null && apiMeta.episodeCount !== episodes.length) {
          warnings.push(
            `话数不一致：API 记录 ${apiMeta.episodeCount} 话，目录页解析到 ${episodes.length} 话`,
          )
        }
      } else {
        warnings.push('站点 API 富化未返回数据，部分元数据缺失')
      }
    }

    if (meta.chapterCount === 0) {
      warnings.push('该作品未分章，所有话的 chapterIndex 为 null')
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      source: {
        site: adapter.id,
        siteName: adapter.name,
        novelId: ref.novelId,
        url: ref.canonicalUrl,
      },
      meta,
      chapters,
      episodes,
      fetch: {
        fetchedAt: nowIso(),
        parserVersion: PARSER_VERSION,
        pagesFetched: totalPages,
        durationMs: Date.now() - startedAt,
        enrichedBy,
        warnings,
      },
    }
  }

  /** 抓取单话正文。 */
  async fetchEpisode(
    input: string,
    index: number,
    options: FetchNovelOptions = {},
  ): Promise<EpisodeContent & { ref: NovelRef }> {
    const { adapter, ref } = this.resolve(input)
    return this.fetchOne(adapter, ref, index, options)
  }

  /**
   * 批量抓取正文。
   *
   * 设计要点：
   * - 并发数可配（默认 1）。实际吞吐由 HttpClient 的 concurrency 与 minIntervalMs 共同决定；
   * - 单话失败不中断整批，失败项收集到 `failed[]` 供重试；
   * - `shouldSkip` 支持断点续传（CLI 用「文件已存在」判断）；
   * - `onEpisode` 在每话完成后立即回调，便于落盘，避免中途失败丢失全部成果。
   */
  async fetchEpisodes(input: string, options: FetchEpisodesOptions = {}): Promise<EpisodeBatchResult> {
    const startedAt = Date.now()
    const { adapter, ref } = this.resolve(input)
    if (!adapter.parseEpisodePage) {
      throw new NovelError('UNSUPPORTED_SITE', `${adapter.name} 暂不支持抓取正文`, { site: adapter.id })
    }

    // 未显式指定序号时，先抓目录拿总话数
    let indices = options.indices
    if (!indices) {
      const record = await this.fetchNovel(input, options)
      indices = record.episodes.map((episode) => episode.index)
    }

    const concurrency = Math.max(1, Math.floor(options.concurrency ?? 1))
    const total = indices.length
    const failed: Array<{ index: number; error: string }> = []
    let fetched = 0
    let skipped = 0
    let done = 0

    const report = (): void => {
      done += 1
      options.onProgress?.({ phase: 'episode', page: done, totalPages: total, message: `已完成 ${done}/${total} 话` })
    }

    await forEachLimit(
      indices,
      concurrency,
      async (index) => {
        if (options.shouldSkip && (await options.shouldSkip(index))) {
          skipped += 1
          report()
          return
        }

        try {
          const content = await this.fetchOne(adapter, ref, index, { ...options, onProgress: undefined })
          await options.onEpisode?.(content)
          fetched += 1
        } catch (err) {
          // 取消不是失败，不计入 failed
          if (err instanceof NovelError && err.code === 'ABORTED') return
          failed.push({ index, error: describeError(err) })
        }
        report()
      },
      options.signal,
    )

    return {
      total,
      fetched,
      skipped,
      failed,
      durationMs: Date.now() - startedAt,
    }
  }

  /** 单话抓取的实际实现（被单话与批量两条路径复用）。 */
  private async fetchOne(
    adapter: SiteAdapter,
    ref: NovelRef,
    index: number,
    options: FetchNovelOptions,
  ): Promise<EpisodeContent & { ref: NovelRef }> {
    if (!adapter.parseEpisodePage) {
      throw new NovelError('UNSUPPORTED_SITE', `${adapter.name} 暂不支持抓取正文`, { site: adapter.id })
    }
    if (!Number.isInteger(index) || index <= 0) {
      throw new NovelError('INVALID_INPUT', `话序号必须是正整数：${index}`)
    }

    const http = options.http ?? this.http
    const url = adapter.episodeUrl ? adapter.episodeUrl(ref, index) : `${ref.canonicalUrl}${index}/`

    options.onProgress?.({ phase: 'episode', page: 0, totalPages: 0, message: `抓取第 ${index} 话` })
    const res = await http.get(url, { signal: options.signal })
    return { ...adapter.parseEpisodePage(res.body, ref, index), ref }
  }
}

/** 去掉值为 undefined 的键，避免覆盖已有字段。 */
function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [key, value] of Object.entries(obj) as [keyof T, T[keyof T]][]) {
    if (value !== undefined) out[key] = value
  }
  return out
}
