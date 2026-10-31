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

export { NovelError, describeError, isNovelError } from './errors'
export type { ErrorCode } from './errors'
export { parseSiteDate, parseSiteDateTime, toDatePart, nowIso } from './time'
export { cleanInline, htmlToParagraphText, htmlToText, normalizeLines } from './text'
export { formatEpisodeRange, parseEpisodeRange } from './range'
export { FetchHttpClient, isRetryableStatus } from './http'
export type { FetchHttpClientOptions } from './http'
export { NovelFetcher, assembleStructure, SCHEMA_VERSION, PARSER_VERSION } from './pipeline'
export type { EpisodeBatchResult, FetchEpisodesOptions, FetchNovelOptions } from './pipeline'
export { MemoryEpisodeStore, storeKey } from './store'
export type { EpisodeManifest, EpisodeStore } from './store'
export { NovelLibrary, createNovelLibrary } from './library'
export type {
  DownloadEpisodesOptions,
  DownloadResult,
  DownloadStatus,
  NovelLibraryOptions,
  SiteInfo,
} from './library'
export { builtinAdapters, getAdapter, resolveTarget } from './sites/registry'
export type { ResolvedTarget } from './sites/registry'
export { SyosetuAdapter } from './sites/syosetu/adapter'
