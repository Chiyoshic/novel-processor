import type { BriefOperationReport } from '../../shared/episode-translation'
import type { TranslationBrief } from '../../shared/translation'
import type { NovelRecord } from './lib/types'
import { validateTranslationBrief } from './translation'

const arrays = ['characters', 'terminology', 'worldbuilding_zh', 'address_rules_zh', 'translation_rules_zh', 'unresolved_questions_zh'] as const
const objectKeys: Record<string, readonly string[]> = {
  novel: ['chinese_title', 'plot_summary_zh'],
  style: ['overall_zh', 'viewpoint_zh', 'narration_zh', 'dialogue_zh', 'rhythm_zh', 'register_zh'],
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }

/** Each operation is isolated; array positions always refer to the pre-operation snapshot. */
export function applyBriefOperations(baseline: TranslationBrief, operations: unknown, record: NovelRecord) {
  const result = structuredClone(baseline)
  const reports: BriefOperationReport[] = []
  const warnings: string[] = []
  const slots = new Map<string, Array<{ originalIndex: number | null; value: unknown; deleted: boolean }>>()
  for (const field of arrays) slots.set(field, result[field].map((value, index) => ({ originalIndex: index, value, deleted: false })))
  const materialize = () => {
    const candidate = structuredClone(result) as unknown as Record<string, unknown>
    for (const [field, values] of slots) candidate[field] = values.filter((value) => !value.deleted).map((value) => value.value)
    return candidate as unknown as TranslationBrief
  }
  if (!Array.isArray(operations)) return { result, reports, warnings: ['材料补充不是数组，已忽略；译文正常保存。'], changed: false }
  let changed = false
  for (const [position, raw] of operations.slice(0, 100).entries()) {
    const field = object(raw) && typeof raw.field === 'string' ? raw.field : '未知字段'
    const action = object(raw) && typeof raw.action === 'string' ? raw.action : '未知动作'
    const report: BriefOperationReport = { position, field, action, ...(object(raw) && Number.isSafeInteger(raw.index) ? { index: Number(raw.index) } : {}), status: 'ignored', message: '' }
    try {
      if (!object(raw) || !['create', 'read', 'update', 'delete'].includes(action)) throw new Error('动作无效')
      if (!slots.has(field) && !Object.hasOwn(objectKeys, field)) throw new Error('字段不在可修改白名单中')
      if (slots.has(field)) {
        const values = slots.get(field)!
        const target = values.find((value) => value.originalIndex === raw.index && !value.deleted)
        if (action !== 'create' && (!Number.isSafeInteger(raw.index) || Number(raw.index) < 0 || !target)) throw new Error('数组序号无效或该项已删除（序号从 0 开始）')
        if (action === 'read') { report.status = 'read'; report.message = '已读取对应材料项'; report.value = structuredClone(target!.value) }
        else {
          // Test each change on a temporary snapshot so an invalid operation cannot contaminate later ones.
          const previous = structuredClone(values)
          if (target) report.previousValue = structuredClone(target.value)
          if (action === 'create') values.push({ originalIndex: null, value: raw.value, deleted: false })
          else if (action === 'update') target!.value = raw.value
          else target!.deleted = true
          try { validateTranslationBrief(materialize(), record) }
          catch { slots.set(field, previous); throw new Error('修改后的字段类型或结构不合法') }
          if (action !== 'delete') report.value = structuredClone(raw.value)
          report.status = 'applied'; report.message = action === 'create' ? '已新增' : action === 'delete' ? '已删除' : '已更新'; changed = true
        }
      } else {
        if (typeof raw.key !== 'string' || !objectKeys[field]!.includes(raw.key)) throw new Error('对象属性不可修改')
        const target = (result as unknown as Record<string, Record<string, string>>)[field]!
        if (action === 'read') { report.status = 'read'; report.message = '已读取对应材料项'; report.value = target[raw.key] }
        else {
          if (action === 'create' && target[raw.key]) throw new Error('属性已有内容，请使用 update')
          if (action === 'delete' && field === 'novel') throw new Error('书名与梗概不能删除')
          const next = action === 'delete' ? '' : raw.value
          if (typeof next !== 'string') throw new Error('对象属性必须为文本')
          if (field === 'novel' && !next.trim()) throw new Error('书名与梗概不能为空')
          report.previousValue = target[raw.key]
          report.value = next
          target[raw.key] = next
          report.status = 'applied'; report.message = action === 'delete' ? '已清空' : '已更新'; changed = true
        }
      }
    } catch (error) {
      report.message = error instanceof Error ? error.message : '修改无效'
      warnings.push(`补充 #${position + 1}（${field} / ${action}）已忽略：${report.message}`)
    }
    reports.push(report)
  }
  if (operations.length > 100) warnings.push(`补充超过 100 条，多出的 ${operations.length - 100} 条已忽略。`)
  return { result: materialize(), reports, warnings, changed }
}
