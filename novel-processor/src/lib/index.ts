/**
 * 公共 API 入口（前端从这里导入）。
 *
 * ```ts
 * import { createNovelLibrary } from '@/lib'
 * const library = createNovelLibrary({ concurrency: 4 })
 * ```
 *
 * 完整方法说明见 docs/api.md。
 */

/* ---------- 领域模型 ---------- */
export type {
  AdapterCapabilities,
  AuthorRef,
  Chapter,
  ContentFlags,
  Episode,
  EpisodeContent,
  FetchProgress,
  HttpClient,
  HttpResponse,
  IndexItem,
  IndexPageResult,
  NovelMeta,
  NovelRecord,
  NovelRef,
  NovelStatus,
  Pagination,
  RawEpisode,
  SiteAdapter,
  SiteId,
  WorkType,
} from './types'

/* ---------- 错误 ---------- */
export { NovelError, describeError, isNovelError } from './errors'
export type { ErrorCode } from './errors'

/* ---------- 工具 ---------- */
export { parseSiteDate, parseSiteDateTime, toDatePart, nowIso } from './time'
export { cleanInline, htmlToParagraphText, htmlToText, normalizeLines } from './text'
export { formatEpisodeRange, parseEpisodeRange } from './range'

/* ---------- HTTP ---------- */
export { FetchHttpClient, isRetryableStatus } from './http'
export type { FetchHttpClientOptions } from './http'

/* ---------- 流水线（底层，可单独使用） ---------- */
export { NovelFetcher, assembleStructure, SCHEMA_VERSION, PARSER_VERSION } from './pipeline'
export type { EpisodeBatchResult, FetchEpisodesOptions, FetchNovelOptions } from './pipeline'

/* ---------- 存储 ---------- */
export { MemoryEpisodeStore, storeKey } from './store'
export type { EpisodeManifest, EpisodeStore } from './store'

/* ---------- 门面（前端首选） ---------- */
export { NovelLibrary, createNovelLibrary } from './library'
export type {
  DownloadEpisodesOptions,
  DownloadResult,
  DownloadStatus,
  NovelLibraryOptions,
  SiteInfo,
} from './library'

/* ---------- 站点 ---------- */
export { builtinAdapters, getAdapter, resolveTarget } from './sites/registry'
export type { ResolvedTarget } from './sites/registry'
export { SyosetuAdapter } from './sites/syosetu/adapter'
