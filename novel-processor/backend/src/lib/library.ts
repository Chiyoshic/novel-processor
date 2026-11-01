/**
 * 前端可直接调用的门面（Facade）。
 *
 * 这一层把「解析 → 抓目录 → 抓正文 → 落盘 → 出清单」串成一组方法，
 * UI 只需要持有 `NovelLibrary` 实例并调用方法，不关心适配器、分页、限速等细节。
 *
 * 设计边界：
 * - 不依赖 Node API（文件系统通过 `EpisodeStore` 注入），浏览器可直接运行；
 * - 每个方法都接受 `AbortSignal`，支持 UI 上的「取消」；
 * - 每个方法都有 `onProgress`，可直接绑定进度条。
 *
 * 浏览器直连站点的前提：站点不返回 CORS 头，需经同源代理（Vite server.proxy
 * 或自建 Node 服务）转发。见 docs/api.md 的「部署形态」一节。
 */
import { FetchHttpClient } from './http'
import { NovelFetcher } from './pipeline'
import { parseEpisodeRange } from './range'
import { MemoryEpisodeStore, storeKey } from './store'
import type {
  AdapterCapabilities,
  EpisodeContent,
  HttpClient,
  NovelRecord,
  NovelRef,
  SiteAdapter,
  SiteId,
} from './types'
import type { EpisodeBatchResult, FetchEpisodesOptions, FetchNovelOptions } from './pipeline'
import type { EpisodeManifest, EpisodeStore } from './store'

/** 站点信息，供前端渲染「支持哪些站点」。 */
export interface SiteInfo {
  id: SiteId
  name: string
  hosts: readonly string[]
  capabilities: AdapterCapabilities
}

export interface NovelLibraryOptions {
  /** 自定义适配器列表（默认使用内置站点） */
  adapters?: SiteAdapter[]
  /** 自定义 HTTP 客户端（默认按 concurrency/minIntervalMs 创建） */
  http?: HttpClient
  /** 正文存储（默认内存存储） */
  store?: EpisodeStore
  /** 默认并发数，同时作用于 HTTP 层与流水线。默认 1 */
  concurrency?: number
  /** 默认请求间隔（毫秒）。默认 800 */
  minIntervalMs?: number
}

/** 批量下载选项。 */
export interface DownloadEpisodesOptions
  extends Omit<FetchEpisodesOptions, 'indices' | 'shouldSkip' | 'onEpisode'> {
  /** 明确指定话序号 */
  indices?: number[]
  /** 区间表达式，如 `1-20` 或 `1-3,7`；与 indices 二选一 */
  range?: string
  /** 是否覆盖已存在的话。默认 false（断点续传） */
  overwrite?: boolean
  /** 每话落盘后回调，用于 UI 实时更新（存储写入由库内部完成） */
  onEpisode?: (content: EpisodeContent) => void | Promise<void>
}

/** 批量下载结果（含清单）。 */
export interface DownloadResult extends EpisodeBatchResult {
  ref: NovelRef
  manifest: EpisodeManifest
}

export class NovelLibrary {
  private readonly fetcher: NovelFetcher
  private readonly http: HttpClient
  private readonly episodeStore: EpisodeStore
  private readonly defaultConcurrency: number

  constructor(options: NovelLibraryOptions = {}) {
    this.defaultConcurrency = Math.max(1, Math.floor(options.concurrency ?? 1))
    this.http =
      options.http ??
      new FetchHttpClient({
        concurrency: this.defaultConcurrency,
        minIntervalMs: options.minIntervalMs ?? 800,
      })
    this.fetcher = new NovelFetcher({ http: this.http, adapters: options.adapters })
    this.episodeStore = options.store ?? new MemoryEpisodeStore()
  }

  /** 当前正文存储实例。 */
  get store(): EpisodeStore {
    return this.episodeStore
  }

  /** 已注册的站点列表。 */
  get sites(): SiteInfo[] {
    return this.fetcher.adapters.map((adapter) => ({
      id: adapter.id,
      name: adapter.name,
      hosts: adapter.hosts,
      capabilities: adapter.capabilities,
    }))
  }

  /**
   * 判断输入属于哪个站点（不抛错，便于输入框实时提示）。
   */
  detectSite(input: string): SiteInfo | null {
    const raw = input.trim()
    if (!raw) return null
    for (const adapter of this.fetcher.adapters) {
      if (adapter.resolve(raw)) {
        return {
          id: adapter.id,
          name: adapter.name,
          hosts: adapter.hosts,
          capabilities: adapter.capabilities,
        }
      }
    }
    return null
  }

  /**
   * 解析输入为规范引用。
   * 无法识别时抛 `UNSUPPORTED_SITE`。
   */
  resolve(input: string): NovelRef {
    return this.fetcher.resolve(input).ref
  }

  /**
   * 抓取作品目录：元数据 + 章 + 话列表。
   * 不落盘，由调用方决定如何保存。
   */
  async fetchCatalog(input: string, options: FetchNovelOptions = {}): Promise<NovelRecord> {
    return this.fetcher.fetchNovel(input, {
      ...options,
      http: this.http,
      concurrency: options.concurrency ?? this.defaultConcurrency,
    })
  }

  /** 抓取单话正文（不落盘）。 */
  async fetchEpisode(input: string, index: number, options: FetchNovelOptions = {}): Promise<EpisodeContent> {
    return this.fetcher.fetchEpisode(input, index, { ...options, http: this.http })
  }

  /**
   * 批量下载正文并写入存储。
   *
   * - 未指定 `indices` / `range` 时视为全部话（会先抓目录确定总数）；
   * - 默认断点续传：已存在的自动跳过，`overwrite: true` 强制重抓；
   * - 单话失败不中断整批，失败项在返回值的 `failed[]` 中；
   * - 结束时写入并返回清单。
   */
  async downloadEpisodes(input: string, options: DownloadEpisodesOptions = {}): Promise<DownloadResult> {
    const { ref } = this.fetcher.resolve(input)

    let indices = options.indices
    if (!indices && options.range) indices = parseEpisodeRange(options.range)

    const concurrency = Math.max(1, Math.floor(options.concurrency ?? this.defaultConcurrency))
    const startedAt = Date.now()

    const result = await this.fetcher.fetchEpisodes(input, {
      http: this.http,
      enrich: options.enrich,
      maxPages: options.maxPages,
      signal: options.signal,
      onProgress: options.onProgress,
      onEpisodeState: options.onEpisodeState,
      concurrency,
      indices,
      shouldSkip: async (index) => (options.overwrite ? false : this.episodeStore.has(ref, index)),
      onEpisode: async (content) => {
        await this.episodeStore.write(ref, content)
        await options.onEpisode?.(content)
      },
    })

    const manifest = await this.buildManifest(ref, {
      ...result,
      durationMs: result.durationMs || Date.now() - startedAt,
      concurrency,
    })

    return { ...result, ref, manifest }
  }

  /** 列出已下载的话序号。 */
  async listDownloaded(input: string): Promise<number[]> {
    const { ref } = this.fetcher.resolve(input)
    return this.episodeStore.list(ref)
  }

  /** 读取已下载的某一话，不存在返回 null。 */
  async readEpisode(input: string, index: number): Promise<EpisodeContent | null> {
    const { ref } = this.fetcher.resolve(input)
    return this.episodeStore.read(ref, index)
  }

  /** 读取最近一次下载清单，没有则返回 null。 */
  async getManifest(input: string): Promise<EpisodeManifest | null> {
    const { ref } = this.fetcher.resolve(input)
    return this.episodeStore.readManifest?.(ref) ?? null
  }

  /**
   * 统计下载进度，供 UI 渲染「已下载 x/总话数」。
   * 需要传入目录以获知总数。
   */
  async getDownloadStatus(input: string, catalog: NovelRecord): Promise<DownloadStatus> {
    const { ref } = this.fetcher.resolve(input)
    const downloaded = await this.episodeStore.list(ref)
    const total = catalog.episodes.length
    const set = new Set(downloaded)
    const missing: number[] = []
    for (const episode of catalog.episodes) {
      if (!set.has(episode.index)) missing.push(episode.index)
    }
    return {
      key: storeKey(ref),
      total,
      downloaded: downloaded.length,
      missing,
      complete: missing.length === 0,
    }
  }

  /** 构造并写入清单。 */
  private async buildManifest(
    ref: NovelRef,
    run: Pick<EpisodeBatchResult, 'total' | 'fetched' | 'skipped' | 'failed' | 'durationMs'> & {
      concurrency: number
    },
  ): Promise<EpisodeManifest> {
    const existing = await this.episodeStore.list(ref)
    const manifest: EpisodeManifest = {
      site: ref.site,
      novelId: ref.novelId,
      updatedAt: new Date().toISOString(),
      have: existing.length,
      lastRun: {
        total: run.total,
        fetched: run.fetched,
        skipped: run.skipped,
        failed: run.failed,
        durationMs: run.durationMs,
        concurrency: run.concurrency,
      },
    }
    await this.episodeStore.writeManifest?.(ref, manifest)
    return manifest
  }
}

/** 下载进度快照。 */
export interface DownloadStatus {
  /** 存储键 `site:novelId` */
  key: string
  total: number
  downloaded: number
  /** 尚未下载的话序号（升序） */
  missing: number[]
  complete: boolean
}

/** 便捷工厂。 */
export function createNovelLibrary(options: NovelLibraryOptions = {}): NovelLibrary {
  return new NovelLibrary(options)
}
