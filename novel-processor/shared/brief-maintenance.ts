import type { ReasoningLevel } from './ai'
import type { TranslationBrief } from './translation'
export const briefModules = ['novel', 'characters', 'style', 'terminology', 'worldbuilding_zh', 'address_rules_zh', 'translation_rules_zh', 'unresolved_questions_zh'] as const
export type BriefModule = typeof briefModules[number]
export const briefModuleLabels: Record<BriefModule, string> = { novel: '书名与梗概', characters: '角色', style: '语言风格', terminology: '术语', worldbuilding_zh: '世界观', address_rules_zh: '称谓规则', translation_rules_zh: '翻译规则', unresolved_questions_zh: '待确认事项' }
export type DuplicateField = Exclude<BriefModule, 'novel' | 'style'>
export interface DuplicateGroup { field: DuplicateField; indices: number[]; label: string }
export interface MaintenanceOptions {
  mode: 'deduplicate' | 'compress'; modelId: number; baseHash: string; reasoningLevel?: ReasoningLevel
  modules: BriefModule[]; groups?: Array<{ field: DuplicateField; indices: number[] }>
  scope?: 'selected' | 'all'; targetPercent?: number
}
export interface MaintenanceChange { field: BriefModule; indices?: number[]; reason: string; before: unknown; after: unknown }
export interface MaintenancePreview {
  id: string; mode: MaintenanceOptions['mode']; baseHash: string; createdAt: string
  beforeBytes: number; afterBytes: number; changes: MaintenanceChange[]; warnings: string[]
  result: TranslationBrief; generation: { attempts: number; jsonRepaired: boolean }; modelName: string
}
export interface BriefRevision { id: number; action: string; createdAt: string; beforeBytes: number; afterBytes: number }

function normalize(value: string): string { return value.normalize('NFKC').toLocaleLowerCase().replace(/[\s・·]/g, '') }
/** Suggestions only. Same Chinese spelling alone is not sufficient evidence that characters are identical. */
export function findBriefDuplicates(brief: TranslationBrief): DuplicateGroup[] {
  const groups: DuplicateGroup[] = []
  for (const field of briefModules) {
    const items = brief[field]
    if (!Array.isArray(items)) continue
    const parent = items.map((_, index) => index)
    const root = (i: number): number => parent[i] === i ? i : (parent[i] = root(parent[i]!))
    const identities = (item: unknown): string[] => {
      if (typeof item === 'string') return [normalize(item)]
      const value = item as Record<string, unknown>
      if (field === 'characters') return [value.original_name, ...(Array.isArray(value.aliases) ? value.aliases : [])].filter((name): name is string => typeof name === 'string' && !!name.trim()).map(normalize)
      return typeof value.original === 'string' ? [normalize(value.original)] : []
    }
    const seen = new Map<string, number>()
    items.forEach((item, index) => {
      for (const key of identities(item)) {
        if (!key) continue
        const other = seen.get(key)
        if (other === undefined) seen.set(key, index)
        else parent[root(index)] = root(other)
      }
    })
    const buckets = new Map<number, number[]>()
    items.forEach((_, index) => { const key = root(index); buckets.set(key, [...(buckets.get(key) ?? []), index]) })
    for (const indices of buckets.values()) if (indices.length > 1) {
      const first = items[indices[0]!] as unknown
      const label = typeof first === 'string' ? first : String((first as Record<string, unknown>).original_name ?? (first as Record<string, unknown>).original)
      groups.push({ field: field as DuplicateField, indices, label })
    }
  }
  return groups
}
