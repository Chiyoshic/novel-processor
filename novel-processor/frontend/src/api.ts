/** 本地数据 API 的类型化客户端。所有网络访问都从这里走。 */
import type { EpisodeContent, NovelRecord, SiteInfo } from '@/lib'
import { readTranslationStream } from '@/lib/translationStream'
import type { TranslationTaskEvent, TranslationInitialization, TranslationOptions } from '@shared/translation'
import type { ReasoningDialect, ReasoningLevel, ResponseProfile } from '@shared/ai'

export interface LibraryEntry {
  site: string
  novelId: string
  title: string
  author: string
  status: string
  statusLabel: string | null
  genre: string | null
  episodeCount: number
  chapterCount: number
  wordCount: number | null
  downloaded: number
  lastEpisodeAt: string | null
  completedAt: string | null
  importedAt: string
  /** 非空表示在回收站中 */
  deletedAt: string | null
  tags: string[]
}


export type AiApiType = 'responses' | 'chat-completions'

export interface AiModelConfig {
  id: number
  name: string
  provider: string
  apiType: AiApiType
  reasoningDialect: ReasoningDialect
  reasoningLevel: ReasoningLevel
  responseProfile: ResponseProfile
  extraBody: Record<string, unknown>
  baseUrl: string
  apiKey: string
  model: string
  windowTokens: number
  inputTokens: number
  outputTokens: number
  headers: Record<string, string>
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface LibraryStats {
  novels: number
  episodes: number
  withContent: number
  trashed: number
}

export type ProgressFilter = 'all' | 'none' | 'partial' | 'complete'
export type NovelSort = 'recent' | 'imported' | 'title' | 'progress'

export interface LibraryQuery {
  q?: string
  site?: string
  status?: string
  genre?: string
  tag?: string
  progress?: ProgressFilter
  sort?: NovelSort
  /** 只看回收站 */
  trashed?: boolean
  page?: number
  limit?: number
}

export interface LibraryPage {
  items: LibraryEntry[]
  total: number
  page: number
  limit: number
}

export interface FacetBucket {
  value: string
  label: string
  count: number
}

export interface LibraryFacets {
  total: number
  /** 回收站条目数 */
  trashed: number
  status: FacetBucket[]
  site: FacetBucket[]
  genre: FacetBucket[]
  tags: FacetBucket[]
}

/** 下载任务进度（内存态，随任务结束而停止变化）。 */
export interface DownloadJob {
  total: number
  done: number
  failed: number
  running: boolean
  startedAt: number
  finishedAt: number | null
}

export interface DownloadProgress {
  downloaded: number
  total: number
  indices: number[]
  job: DownloadJob | null
}

export interface DownloadSummary {
  total: number
  fetched: number
  skipped: number
  failed: Array<{ index: number; error: string }>
  durationMs: number
  manifest: { have: number }
}

const apiBase = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const payload = (await res.json().catch(() => null)) as T | { error?: string } | null
  if (!res.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload ? payload.error : undefined
    throw new Error(message ?? `请求失败（${res.status}）`)
  }
  return payload as T
}

export const api = {
  sites: () => request<SiteInfo[]>('/sites'),

  aiModels: () => request<AiModelConfig[]>('/settings/models'),

  saveAiModel: (model: Partial<AiModelConfig>) =>
    request<AiModelConfig>(model.id ? `/settings/models/${model.id}` : '/settings/models', {
      method: model.id ? 'PUT' : 'POST', body: JSON.stringify(model),
    }),

  deleteAiModel: (id: number) => request<{ ok: boolean }>(`/settings/models/${id}`, { method: 'DELETE' }),

  testAiModel: (id: number, prompt?: string) =>
    request<{ text: string; model: string; apiType: AiApiType }>(`/settings/models/${id}/test`, {
      method: 'POST', body: JSON.stringify({ prompt }),
    }),

  translationInitialization: (site: string, novelId: string) =>
    request<TranslationInitialization | null>(`/library/${site}/${novelId}/translation/initialize`),

  initializeTranslation: (site: string, novelId: string, options: TranslationOptions, signal?: AbortSignal) =>
    request<TranslationInitialization>(`/library/${site}/${novelId}/translation/initialize`, {
      method: 'POST', body: JSON.stringify(options), signal,
    }),

  streamTranslation: async (site: string, novelId: string, options: TranslationOptions, onEvent: (event: TranslationTaskEvent) => void, signal?: AbortSignal) => {
    const response = await fetch(`${apiBase}/library/${site}/${novelId}/translation/initialize`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
      body: JSON.stringify(options), signal,
    })
    return readTranslationStream(response, onEvent)
  },

  stats: () => request<LibraryStats>('/stats'),

  facets: () => request<LibraryFacets>('/facets'),

  library: (query: LibraryQuery = {}) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '' || value === 'all') continue
      if (value === false) continue
      params.set(key, value === true ? '1' : String(value))
    }
    const qs = params.toString()
    return request<LibraryPage>(`/library${qs ? `?${qs}` : ''}`)
  },

  sync: () => request<{ novels: number; episodes: number; stats: LibraryStats }>('/sync', { method: 'POST' }),

  catalog: (site: string, novelId: string) => request<NovelRecord>(`/library/${site}/${novelId}`),

  /** 重新抓取目录（更新元数据与话列表） */
  refresh: (site: string, novelId: string) =>
    request<NovelRecord>(`/library/${site}/${novelId}/refresh`, { method: 'POST' }),

  progress: (site: string, novelId: string) =>
    request<DownloadProgress>(`/library/${site}/${novelId}/status`),

  episode: (site: string, novelId: string, index: number) =>
    request<EpisodeContent>(`/library/${site}/${novelId}/episodes/${index}`),

  importNovel: (input: string, site?: string) =>
    request<NovelRecord>('/import', { method: 'POST', body: JSON.stringify({ input, site }) }),

  download: (
    site: string,
    novelId: string,
    options: { range?: string; all?: boolean; overwrite?: boolean; concurrency?: number },
  ) =>
    request<DownloadSummary>(`/library/${site}/${novelId}/fetch`, {
      method: 'POST',
      body: JSON.stringify(options),
    }),

  /** 一级删除：移入回收站 */
  trash: (site: string, novelId: string) =>
    request<{ ok: boolean }>(`/library/${site}/${novelId}`, { method: 'DELETE' }),

  /** 二级删除：连同磁盘文件永久删除 */
  purge: (site: string, novelId: string) =>
    request<{ ok: boolean }>(`/library/${site}/${novelId}?permanent=1`, { method: 'DELETE' }),

  restore: (site: string, novelId: string) =>
    request<{ ok: boolean }>(`/library/${site}/${novelId}/restore`, { method: 'POST' }),

  emptyTrash: () => request<{ removed: number; stats: LibraryStats }>('/trash/empty', { method: 'POST' }),
}
