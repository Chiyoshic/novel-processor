import type { AiProgressEvent } from './ai-task'
import type { ReasoningLevel } from './ai'

export interface TranslationStyleReference extends TranslatedArticle { index: number }
export interface TranslatedArticle { title: string; preface: string; body: string; afterword: string }
export interface BriefOperation {
  field: string
  action: 'create' | 'read' | 'update' | 'delete'
  /** Zero-based position in the baseline BEFORE this episode's operations. */
  index?: number
  key?: string
  value?: unknown
}
export interface BriefOperationReport { position: number; action: string; field: string; index?: number; status: 'applied' | 'read' | 'ignored'; message: string; value?: unknown; previousValue?: unknown }
export interface StoredEpisodeTranslation extends TranslatedArticle {
  language: 'zh-CN'; translatedAt: string; modelId: number; modelName: string; model: string
  sourceHash: string; referenceEpisodeIndex?: number; promptVersion: string; runId: string; attempts: number
  updates: BriefOperationReport[]; warnings: string[]; stale?: boolean
}
export type EpisodeTranslationState = 'queued' | 'translating' | 'translated' | 'failed' | 'cancelled' | 'stale'
export interface EpisodeTranslationStatus {
  site: string; novelId: string; index: number; status: EpisodeTranslationState; hasTranslation: boolean
  translatedAt: string | null; updatedAt: string; modelName: string; sourceHash: string
  attempts: number; error: string | null; warnings: string[]; updates: BriefOperationReport[]
}
export interface TranslateEpisodesOptions {
  modelId: number; indices: number[]; overwrite: boolean; requirements: string; reasoningLevel?: ReasoningLevel
}
export interface TranslationBatchJob {
  id: string; running: boolean; stopping: boolean; startedAt: number; finishedAt: number | null
  modelName: string; model: string; apiType: string; reasoningLevel: ReasoningLevel
  indices: number[]; done: number[]; failed: Array<{ index: number; error: string }>; skipped: number[]; cancelled: number[]
  current: { index: number; title: string; startedAt: number; finishedAt: number | null; lastEventAt: number; events: AiProgressEvent[]; status: 'translating' | 'translated' | 'failed' | 'cancelled'; warnings: string[] } | null
}
export interface EpisodeTranslationsResponse { episodes: EpisodeTranslationStatus[]; job: TranslationBatchJob | null }
export const episodeTranslationLabels: Record<EpisodeTranslationState, string> = {
  queued: '排队中', translating: '翻译中', translated: '已翻译', failed: '翻译失败', cancelled: '已停止', stale: '原文已更新',
}
