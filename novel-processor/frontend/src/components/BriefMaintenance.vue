<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { api, type AiModelConfig } from '@/api'
import type { TranslationInitialization } from '@shared/translation'
import { briefModules, briefModuleLabels, type BriefModule, type MaintenancePreview, type MaintenanceOptions, type DuplicateGroup, type BriefRevision } from '@shared/brief-maintenance'
import { reasoningLevels, type ReasoningLevel } from '@shared/ai'
import TranslationTaskPanel from './TranslationTaskPanel.vue'
import { applyTranslationEvent, newTranslationTask, finishTranslationTask, type TranslationTaskState } from '@/lib/translationTask'
import { notify } from '@/stores/toast'

const props = defineProps<{ saved: TranslationInitialization; models: AiModelConfig[]; disabled?: boolean }>()
const emit = defineEmits<{ updated: [value: TranslationInitialization]; busy: [value: boolean] }>()
const open = ref(false)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const info = ref<{ baseHash: string; bytes: number; duplicates: DuplicateGroup[]; revisions: BriefRevision[] } | null>(null)
const selectedGroups = ref(new Set<number>())
const selectedModules = ref(new Set<BriefModule>(briefModules))
const mode = ref<'deduplicate' | 'compress'>('deduplicate')
const modelId = ref(props.models.some((model) => model.id === props.saved.modelId) ? props.saved.modelId : props.models[0]?.id ?? 0)
const reasoning = ref<ReasoningLevel | 'inherit'>('inherit')
const targetPercent = ref(60)
const model = computed(() => props.models.find((item) => item.id === modelId.value))
const levels = computed(() => reasoningLevels(model.value?.reasoningDialect ?? 'none'))
const preview = ref<MaintenancePreview | null>(null)
const task = ref<TranslationTaskState | null>(null)
let controller: AbortController | undefined
let alive = true
watch(modelId, () => { reasoning.value = 'inherit' })
watch(() => props.saved.updatedAt, () => { if (!busy.value) { preview.value = null; void load() } })
function size(bytes: number): string { return `${(bytes / 1024).toFixed(1)} KB` }
function toggleGroup(index: number): void { const next = new Set(selectedGroups.value); if (next.has(index)) next.delete(index); else next.add(index); selectedGroups.value = next }
function toggleModule(field: BriefModule): void { const next = new Set(selectedModules.value); if (next.has(field)) next.delete(field); else next.add(field); selectedModules.value = next }
function setBusy(value: boolean): void { busy.value = value; emit('busy', value) }
async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const value = await api.briefMaintenance(props.saved.site, props.saved.novelId)
    if (!alive) return
    info.value = value
    selectedGroups.value = new Set(value.duplicates.map((_, index) => index))
  } catch (err) { if (alive) error.value = err instanceof Error ? err.message : '读取维护信息失败' }
  finally { loading.value = false }
}
async function generate(scope: 'selected' | 'all'): Promise<void> {
  if (!info.value || !model.value || busy.value || props.disabled) return
  const modules = [...selectedModules.value]
  const groups = [...selectedGroups.value].map((index) => info.value!.duplicates[index]!).filter(Boolean)
  const options: MaintenanceOptions = { mode: mode.value, modelId: modelId.value, baseHash: info.value.baseHash, modules, scope, targetPercent: targetPercent.value, ...(mode.value === 'deduplicate' && scope === 'selected' ? { groups } : {}), ...(reasoning.value !== 'inherit' ? { reasoningLevel: reasoning.value } : {}) }
  if (mode.value === 'deduplicate' && scope === 'selected') options.modules = [...new Set(groups.map((group) => group.field))]
  setBusy(true); error.value = ''; preview.value = null
  controller = new AbortController()
  task.value = newTranslationTask({ modelName: model.value.name, model: model.value.model, apiType: model.value.apiType, reasoningLevel: reasoning.value === 'inherit' ? model.value.reasoningLevel : reasoning.value, episodeCount: 0 })
  task.value.logs = [{ at: Date.now(), message: mode.value === 'deduplicate' ? '已提交 AI 去重任务' : '已提交 AI 压缩任务' }]
  const requestController = controller
  try {
    preview.value = await api.previewBriefMaintenance(props.saved.site, props.saved.novelId, options, (event) => { if (task.value) applyTranslationEvent(task.value, event) }, requestController.signal)
    task.value.status = 'preview'; task.value.finishedAt = Date.now()
    task.value.logs.push({ at: Date.now(), message: '预览已生成；确认应用后才写入材料，应用前会自动备份。' })
  } catch (err) {
    const message = requestController.signal.aborted ? '维护已停止，原材料未修改' : err instanceof Error ? err.message : '生成预览失败'
    if (task.value) finishTranslationTask(task.value, requestController.signal.aborted ? 'cancelled' : 'failed', message)
    error.value = message
  } finally { controller = undefined; setBusy(false) }
}
async function apply(): Promise<void> {
  if (!preview.value || busy.value || props.disabled) return
  setBusy(true); error.value = ''
  try {
    const saved = await api.applyBriefMaintenance(props.saved.site, props.saved.novelId, preview.value.id)
    emit('updated', saved); preview.value = null
    if (task.value) { task.value.status = 'completed'; task.value.finishedAt = Date.now() }
    notify('材料已更新，旧版本已备份'); await load()
  } catch (err) { error.value = err instanceof Error ? err.message : '应用失败' }
  finally { setBusy(false) }
}
async function restore(revisionId: number): Promise<void> {
  if (!info.value || busy.value || props.disabled) return
  setBusy(true); error.value = ''
  try {
    const value = await api.restoreBriefRevision(props.saved.site, props.saved.novelId, revisionId, info.value.baseHash)
    emit('updated', value); preview.value = null; task.value = null
    notify('已恢复操作前材料，当前版本也已备份'); await load()
  } catch (err) { error.value = err instanceof Error ? err.message : '恢复失败' }
  finally { setBusy(false) }
}
onMounted(() => void load())
onUnmounted(() => { alive = false; controller?.abort(); emit('busy', false) })
</script>

<template>
  <section class="maintenance" aria-label="翻译材料维护">
    <header class="maintenance-head"><div><h3>材料维护</h3><p>{{ info ? size(info.bytes) : '读取材料体积…' }}<span v-if="info"> · {{ info.duplicates.length }} 组疑似重复</span></p></div><button class="pill pill--ghost pill--small" type="button" :aria-expanded="open" @click="open = !open">{{ open ? '收起维护' : '去重与压缩' }}</button></header>
    <div v-if="open" class="maintenance-content">
      <div class="mode-tabs tab-selector" role="group" aria-label="维护方式"><button type="button" :aria-pressed="mode === 'deduplicate'" :disabled="busy" @click="mode = 'deduplicate'">AI 合并重复</button><button type="button" :aria-pressed="mode === 'compress'" :disabled="busy" @click="mode = 'compress'">AI 压缩总结</button></div>
      <p v-if="mode === 'deduplicate'" class="help">选择重复组，或让 AI 一次检查选中模块内的全部重复。AI 综合信息后生成预览，不直接删条目。</p>
      <p v-else class="help">精简剧情流水账与重复说明，保留角色、固定译名、来源 ID 和关键规则。应用后仅影响后续翻译材料，不改已有译文。</p>
      <fieldset :disabled="busy || disabled"><div class="form-grid"><label>维护模型<select v-model.number="modelId"><option :value="0" disabled>选择模型</option><option v-for="item in models" :key="item.id" :value="item.id">{{ item.name }} · {{ item.model }}</option></select></label><label>思考等级<select v-model="reasoning"><option value="inherit">沿用配置（{{ model?.reasoningLevel ?? 'default' }}）</option><option v-for="level in levels" :key="level" :value="level">{{ level }}</option></select></label></div>
        <div class="module-head"><span>选择模块</span><button type="button" @click="selectedModules = new Set(briefModules)">全选</button><button type="button" @click="selectedModules = new Set()">清空</button></div><div class="module-options"><label v-for="field in briefModules" :key="field" :class="{ checked: selectedModules.has(field) }"><input type="checkbox" :checked="selectedModules.has(field)" @change="toggleModule(field)" />{{ briefModuleLabels[field] }}</label></div>
        <label v-if="mode === 'compress'" class="target-label">目标体积<select v-model.number="targetPercent"><option :value="80">原体积的 80% · 轻度精简</option><option :value="60">原体积的 60% · 适度总结</option><option :value="40">原体积的 40% · 深度总结</option></select><small>软目标，必要信息完整性优先。</small></label>
        <div v-if="mode === 'deduplicate'" class="duplicate-groups"><header><strong>疑似重复组</strong><button type="button" @click="selectedGroups = new Set(info?.duplicates.map((_, index) => index))">全选重复组</button></header><p v-if="loading" class="help">读取中…</p><p v-else-if="!info?.duplicates.length" class="help">未发现名称明确相同的项目，可用“AI 检查全部重复”识别语义或别名重复。</p><label v-for="(group, index) in info?.duplicates" :key="`${group.field}-${index}`" class="duplicate-row"><input type="checkbox" :checked="selectedGroups.has(index)" @change="toggleGroup(index)" /><div><strong>{{ group.label }}</strong><span>{{ briefModuleLabels[group.field] }} · {{ group.indices.map((i) => `#${i}`).join('、') }} · {{ group.indices.length }} 项</span></div></label></div>
      </fieldset>
      <div class="maintenance-actions"><template v-if="mode === 'deduplicate'"><button class="pill" type="button" :disabled="busy || disabled || !model || !selectedGroups.size" @click="generate('selected')">AI 合并所选 {{ selectedGroups.size }} 组</button><button class="pill pill--ghost" type="button" :disabled="busy || disabled || !model || !selectedModules.size" @click="generate('all')">AI 检查全部重复</button></template><button v-else class="pill" type="button" :disabled="busy || disabled || !model || !selectedModules.size" @click="generate('all')">压缩所选 {{ selectedModules.size }} 个模块</button><button class="pill pill--ghost pill--small" type="button" :disabled="busy" @click="load">重新检查</button></div>
      <p v-if="error" class="maintenance-error" role="alert">{{ error }}</p>
      <TranslationTaskPanel v-if="task" :task="task" :title="mode === 'deduplicate' ? 'AI 合并重复材料' : 'AI 压缩材料'" @cancel="controller?.abort()" />
      <section v-if="preview" class="preview" aria-label="材料修改预览"><header><h3>修改预览</h3><span>{{ size(preview.beforeBytes) }} → {{ size(preview.afterBytes) }}<template v-if="preview.beforeBytes"> · 减少 {{ ((1 - preview.afterBytes / preview.beforeBytes) * 100).toFixed(1) }}%</template></span></header><p v-for="(warning, index) in preview.warnings" :key="index" class="help">{{ warning }}</p><details v-for="(change, index) in preview.changes" :key="index" class="change"><summary>{{ briefModuleLabels[change.field] }}<span v-if="change.indices"> · {{ change.indices.map((i) => `#${i}`).join('、') }} → 1 项</span></summary><p>{{ change.reason }}</p><div class="diff-grid"><div><h4>修改前</h4><pre>{{ JSON.stringify(change.before, null, 2) }}</pre></div><div><h4>AI 总结后</h4><pre>{{ JSON.stringify(change.after, null, 2) }}</pre></div></div></details><div class="preview-actions"><button class="pill" type="button" :disabled="busy || disabled || !preview.changes.length" @click="apply">备份并应用 {{ preview.changes.length }} 处修改</button><button class="pill pill--ghost pill--small" type="button" :disabled="busy" @click="preview = null">丢弃预览</button></div></section>
      <details v-if="info?.revisions.length" class="history"><summary>操作备份 · 最近 {{ info.revisions.length }} 条</summary><div v-for="revision in info.revisions" :key="revision.id" class="history-row"><div><strong>{{ revision.action === 'deduplicate' ? 'AI 去重' : revision.action === 'compress' ? 'AI 压缩' : '恢复备份' }}</strong><p>{{ new Date(revision.createdAt).toLocaleString() }} · {{ size(revision.beforeBytes) }} → {{ size(revision.afterBytes) }}</p></div><button class="pill pill--ghost pill--small" type="button" :disabled="busy || disabled" @click="restore(revision.id)">恢复操作前版本</button></div></details>
    </div>
  </section>
</template>

<style scoped>
.maintenance { padding: 20px; margin-top: 24px; background: var(--paper); border: 1px solid var(--line); border-radius: 22px; min-width: 0; overflow-wrap: anywhere; }.maintenance-head,.preview > header,.module-head,.duplicate-groups > header,.history-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }h3 { font-size: 17px; line-height: 1.7; }.maintenance-head p,.history-row p { color: var(--muted); font-size: 12px; line-height: 1.8; margin-top: 5px; }.maintenance-content { margin-top: 20px; }.mode-tabs { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px; width: fit-content; border-radius: 999px; background: var(--white); border: 0; }.mode-tabs button { border: 0; background: transparent; color: var(--muted); border-radius: 999px; padding: 10px 16px; font: inherit; font-size: 13px; cursor: pointer; }.mode-tabs button[aria-pressed=true] { color: var(--blue-dark); background: var(--blue-soft); }.help { color: var(--muted); font-size: 12px; line-height: 1.9; margin: 14px 0; }fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }.form-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; }.form-grid label,.target-label { display: grid; gap: 8px; font-size: 12px; color: var(--muted); }select { width: 100%; min-width: 0; padding: 12px; border-radius: 14px; color: var(--ink); background: var(--white); border: 1px solid var(--line); font: inherit; font-size: 14px; }.module-head { justify-content: flex-start; margin: 20px 0 10px; font-size: 12px; color: var(--muted); }.module-head button,.duplicate-groups header button { border: 0; background: transparent; color: var(--blue-dark); font: inherit; font-size: 12px; cursor: pointer; }.module-options { display: flex; flex-wrap: wrap; gap: 8px; }.module-options label { display: inline-flex; gap: 7px; align-items: center; font-size: 12px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--white); cursor: pointer; }.module-options label.checked { border-color: var(--blue-dark); color: var(--blue-dark); background: var(--blue-soft); }input { accent-color: var(--blue-dark); flex-shrink: 0; }.target-label { margin-top: 18px; max-width: 340px; }.target-label small { font-size: 11px; }.duplicate-groups { margin-top: 20px; border: 1px solid var(--line); background: var(--white); border-radius: 18px; padding: 16px; }.duplicate-groups header strong { font-size: 13px; }.duplicate-row { display: flex; align-items: flex-start; gap: 10px; border-top: 1px solid var(--line); padding: 12px 0; margin-top: 10px; cursor: pointer; }.duplicate-row strong { display: block; font-size: 14px; line-height: 1.8; }.duplicate-row span { color: var(--muted); font-size: 12px; line-height: 1.8; }.duplicate-row input { margin-top: 6px; }.maintenance-actions,.preview-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }.maintenance-error { padding: 12px; background: var(--blue-soft); border-radius: 14px; margin-top: 16px; font-size: 13px; line-height: 1.8; }.preview { margin-top: 24px; border-top: 1px solid var(--line); padding-top: 20px; }.preview > header > span { color: var(--blue-dark); font-size: 13px; }.change { margin-top: 14px; border: 1px solid var(--line); border-radius: 16px; padding: 14px; background: var(--white); }summary { cursor: pointer; font-size: 13px; line-height: 1.8; }.change p { font-size: 13px; line-height: 1.8; margin-top: 12px; }.diff-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; margin-top: 14px; }.diff-grid > div { min-width: 0; }h4 { font-size: 12px; color: var(--muted); margin-bottom: 8px; }pre { max-height: 320px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; padding: 12px; border-radius: 12px; background: var(--paper); color: var(--ink); font-size: 12px; line-height: 1.8; }.history { margin-top: 24px; border-top: 1px solid var(--line); padding-top: 14px; }.history-row { padding: 16px 0; border-bottom: 1px solid var(--line); }.history-row strong { font-size: 13px; }
@media(max-width:720px) { .maintenance { padding: 16px 12px; }.form-grid,.diff-grid { grid-template-columns: 1fr; }select { font-size: 16px; }.maintenance-actions > .pill,.preview-actions > .pill { width: 100%; justify-content: center; }.duplicate-groups { padding: 12px; } }
</style>
