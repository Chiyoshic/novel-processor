/** 本地数据 API 的类型化客户端。所有网络访问都从这里走。 */
import type { EpisodeContent, NovelRecord, SiteInfo } from '@/lib'

export interface LibraryEntry {
  site: string
  novelId: string
  title: string
  author: string
  status: string
  statusLabel: string | null
  episodeCount: number
  chapterCount: number
  wordCount: number | null
  downloaded: number
  lastEpisodeAt: string | null
  completedAt: string | null
  tags: string[]
}

export interface DownloadProgress {
  downloaded: number
  total: number
  indices: number[]
}

export interface DownloadSummary {
  total: number
  fetched: number
  skipped: number
  failed: Array<{ index: number; error: string }>
  durationMs: number
  manifest: { have: number }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
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

  library: () => request<LibraryEntry[]>('/library'),

  catalog: (site: string, novelId: string) => request<NovelRecord>(`/library/${site}/${novelId}`),

  progress: (site: string, novelId: string) =>
    request<DownloadProgress>(`/library/${site}/${novelId}/status`),

  episode: (site: string, novelId: string, index: number) =>
    request<EpisodeContent>(`/library/${site}/${novelId}/episodes/${index}`),

  importNovel: (input: string) =>
    request<NovelRecord>('/import', { method: 'POST', body: JSON.stringify({ input }) }),

  download: (
    site: string,
    novelId: string,
    options: { range?: string; all?: boolean; overwrite?: boolean; concurrency?: number },
  ) =>
    request<DownloadSummary>(`/library/${site}/${novelId}/fetch`, {
      method: 'POST',
      body: JSON.stringify(options),
    }),

  remove: (site: string, novelId: string) =>
    request<{ ok: boolean }>(`/library/${site}/${novelId}`, { method: 'DELETE' }),
}
