import type { ReasoningLevel } from './ai'

/** Translation initialization is the required first step before chapter translation. */
export interface TranslationOptions {
  modelId: number
  chapterCount: number
  includeSummary: boolean
  includePreface: boolean
  requirements: string
  reasoningLevel?: ReasoningLevel
}

export interface TranslationBrief {
  schema_version: '1.0'
  language: 'zh-CN'
  novel: { original_title: string; chinese_title: string; plot_summary_zh: string }
  characters: Array<{
    original_name: string
    aliases: string[]
    chinese_name: string
    identity_zh: string
    naming_notes_zh: string
    speech_style_zh: string
    evidence: Array<{ episode_index: number; quote: string }>
    confidence: 'high' | 'medium' | 'low'
  }>
  style: { overall_zh: string; viewpoint_zh: string; narration_zh: string; dialogue_zh: string; rhythm_zh: string; register_zh: string }
  terminology: Array<{ original: string; chinese: string; category_zh: string; notes_zh: string }>
  worldbuilding_zh: string[]
  address_rules_zh: string[]
  translation_rules_zh: string[]
  unresolved_questions_zh: string[]
}

export interface TranslationInitialization {
  id: number
  site: string
  novelId: string
  modelId: number
  request: TranslationOptions & {
    promptVersion: string
    model: string
    modelName: string
    apiType: string
    reasoningDialect: string
    effectiveReasoningLevel: ReasoningLevel
    selectionUnit: 'chapter' | 'episode'
    episodes: Array<{ index: number; title: string }>
    sourceHash: string
    budgetEstimate: number
    generation?: { attempts: number; jsonRepaired: boolean; startedAt?: string; finishedAt?: string; durationMs?: number }
  }
  result: TranslationBrief
  createdAt: string
  updatedAt: string
}

export type TranslationTaskEvent = import('./ai-task').AiProgressEvent | ({ at: number } & (
  | { type: 'heartbeat' }
  | { type: 'started'; modelName: string; model: string; apiType: string; reasoningLevel: ReasoningLevel; episodeCount: number }
  | { type: 'phase'; phase: 'reading' | 'preparing' | 'saving' }
  | { type: 'completed'; saved: TranslationInitialization }
  | { type: 'error'; message: string; attempts: number }
))
