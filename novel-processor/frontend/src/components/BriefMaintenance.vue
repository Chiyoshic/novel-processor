<script setup lang="ts">
import NormalButton from './NormalButton.vue'
import CompactButton from './CompactButton.vue'
import PillMultiSelect from './PillMultiSelect.vue'
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
    <div class="maintenance-content">
      <AppTabs v-model="mode" variant="inverted" label="维护方式" :disabled="busy" :options="[{ value: 'deduplicate', label: 'AI 合并重复' }, { value: 'compress', label: 'AI 压缩总结' }]" />
      <header class="maintenance-head"><p>{{ info ? size(info.bytes) : '读取材料体积…' }}</p></header>
      <p v-if="mode === 'deduplicate'" class="help">选择重复组，或让 AI 一次检查选中模块内的全部重复。AI 综合信息后生成预览，不直接删条目。</p>
      <p v-else class="help">精简剧情流水账与重复说明，保留角色、固定译名、来源 ID 和关键规则。应用后仅影响后续翻译材料，不改已有译文。</p>
      <fieldset :disabled="busy || disabled"><div class="form-grid"><label><span class="form-section-title">维护模型</span><AppSelect soft-shadow v-model="modelId" block label="维护模型" :options="[{ value: 0, label: '选择模型', disabled: true }, ...models.map(item => ({ value: item.id, label: item.name, hint: item.model }))]" /></label><label><span class="form-section-title">思考等级</span><AppSelect soft-shadow v-model="reasoning" block label="思考等级" :options="[{ value: 'inherit', label: `沿用配置（${model?.reasoningLevel ?? 'default'}）` }, ...levels.map(level => ({ value: level, label: level }))]" /></label></div>
        <div class="module-head"><span class="form-section-title">选择模块</span><CompactButton variant="secondary" @click="selectedModules = new Set(briefModules)">全选</CompactButton><CompactButton variant="secondary" tone="danger" @click="selectedModules = new Set()">清空</CompactButton></div><PillMultiSelect v-model="selectedModules" label="选择材料模块" :disabled="busy || disabled" :options="briefModules.map(field => ({ value: field, label: briefModuleLabels[field] }))" />
        <label v-if="mode === 'compress'" class="target-label"><span class="form-section-title">目标体积</span><AppSelect soft-shadow v-model="targetPercent" block label="目标体积" :options="[{ value: 80, label: '原体积的 80%', hint: '轻度精简' }, { value: 60, label: '原体积的 60%', hint: '适度总结' }, { value: 40, label: '原体积的 40%', hint: '深度总结' }]" /><small>软目标，必要信息完整性优先。</small></label>
        <div v-if="mode === 'deduplicate'" class="duplicate-groups"><header><strong class="form-section-title">疑似重复组</strong><button type="button" @click="selectedGroups = new Set(info?.duplicates.map((_, index) => index))">全选重复组</button></header><p v-if="loading" class="help">读取中…</p><p v-else-if="!info?.duplicates.length" class="help">未发现名称明确相同的项目，可用“AI 检查全部重复”识别语义或别名重复。</p><label v-for="(group, index) in info?.duplicates" :key="`${group.field}-${index}`" class="duplicate-row"><input type="checkbox" :checked="selectedGroups.has(index)" @change="toggleGroup(index)" /><div><strong>{{ group.label }}</strong><span>{{ briefModuleLabels[group.field] }} · {{ group.indices.map((i) => `#${i}`).join('、') }} · {{ group.indices.length }} 项</span></div></label></div>
      </fieldset>
      <div class="maintenance-actions">
        <template v-if="mode === 'deduplicate'">
          <NormalButton :disabled="busy || disabled || !model || !selectedGroups.size" @click="generate('selected')">AI 合并所选 {{ selectedGroups.size }} 组</NormalButton>
          <div class="duplicate-actions">
            <NormalButton class="duplicate-action duplicate-action--ai" :disabled="busy || disabled || !model || !selectedModules.size" @click="generate('all')">AI检查</NormalButton>
            <NormalButton class="duplicate-action duplicate-action--match" :disabled="busy" @click="load">匹配检查</NormalButton>
          </div>
        </template>
        <template v-else>
          <NormalButton :disabled="busy || disabled || !model || !selectedModules.size" @click="generate('all')">压缩所选 {{ selectedModules.size }} 个模块</NormalButton>
        </template>
      </div>
      <p v-if="error" class="maintenance-error" role="alert">{{ error }}</p>
      <TranslationTaskPanel v-if="task" :task="task" :title="mode === 'deduplicate' ? 'AI 合并重复材料' : 'AI 压缩材料'" @cancel="controller?.abort()" />
      <section v-if="preview" class="preview" aria-label="材料修改预览"><header><h3>修改预览</h3><span>{{ size(preview.beforeBytes) }} → {{ size(preview.afterBytes) }}<template v-if="preview.beforeBytes"> · 减少 {{ ((1 - preview.afterBytes / preview.beforeBytes) * 100).toFixed(1) }}%</template></span></header><p v-for="(warning, index) in preview.warnings" :key="index" class="help">{{ warning }}</p><details v-for="(change, index) in preview.changes" :key="index" class="change"><summary>{{ briefModuleLabels[change.field] }}<span v-if="change.indices"> · {{ change.indices.map((i) => `#${i}`).join('、') }} → 1 项</span></summary><p>{{ change.reason }}</p><div class="diff-grid"><div><h4>修改前</h4><pre>{{ JSON.stringify(change.before, null, 2) }}</pre></div><div><h4>AI 总结后</h4><pre>{{ JSON.stringify(change.after, null, 2) }}</pre></div></div></details><div class="preview-actions"><button class="pill" type="button" :disabled="busy || disabled || !preview.changes.length" @click="apply">备份并应用 {{ preview.changes.length }} 处修改</button><button class="pill pill--ghost pill--small" type="button" :disabled="busy" @click="preview = null">丢弃预览</button></div></section>
      <details v-if="info?.revisions.length" class="history"><summary>操作备份 · 最近 {{ info.revisions.length }} 条</summary><div v-for="revision in info.revisions" :key="revision.id" class="history-row"><div><strong>{{ revision.action === 'deduplicate' ? 'AI 去重' : revision.action === 'compress' ? 'AI 压缩' : '恢复备份' }}</strong><p>{{ new Date(revision.createdAt).toLocaleString() }} · {{ size(revision.beforeBytes) }} → {{ size(revision.afterBytes) }}</p></div><button class="pill pill--ghost pill--small" type="button" :disabled="busy || disabled" @click="restore(revision.id)">恢复操作前版本</button></div></details>
    </div>
  </section>
</template>

<style scoped>
.maintenance { padding: 0; margin: 0; background: transparent; border: 0; border-radius: 0; min-width: 0; overflow-wrap: anywhere; }.maintenance-head,.preview > header,.module-head,.duplicate-groups > header,.history-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }h3 { font-size: 17px; line-height: 1.7; }.maintenance-head p,.history-row p { color: var(--muted); font-size: 12px; line-height: 1.8; margin-top: 5px; }.maintenance-content { margin-top: 0; }
.maintenance-content > .app-tabs { margin-bottom: 18px; }
.duplicate-actions {
  display: flex;
  flex: 1 1 100%;
  gap: 10px;
  min-width: 0;
}
.duplicate-actions .duplicate-action {
  flex: 1 1 0;
  min-width: 0;
  justify-content: center;
}
.duplicate-action--ai {
  background: var(--blue);
  color: #fff;
}
.duplicate-action--ai:hover:not(:disabled) {
  background: var(--blue-dark);
}
.duplicate-action--match {
  background: #8b5bc7;
  color: #fff;
}
.duplicate-action--match:hover:not(:disabled) {
  background: #7245aa;
}
:global(html[data-theme='dark']) .duplicate-action--match {
  background: #b38be3;
  color: #19202a;
}
:global(html[data-theme='dark']) .duplicate-action--match:hover:not(:disabled) {
  background: #c5a4ed;
}.help { color: var(--muted); font-size: 12px; line-height: 1.9; margin: 14px 0; }fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }.form-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; }.form-grid label,.target-label { min-width: 0; display: grid; gap: 8px; font-size: 12px; color: var(--muted); }.module-head { justify-content: flex-start; margin: 20px 0 10px; font-size: 12px; color: var(--muted); }.duplicate-groups header button { border: 0; background: transparent; color: var(--blue-dark); font: inherit; font-size: 12px; cursor: pointer; }input { accent-color: var(--blue-dark); flex-shrink: 0; }.target-label { margin-top: 18px; max-width: 340px; }.target-label small { font-size: 11px; }.duplicate-groups { margin-top: 20px; border: 0; background: var(--white); border-radius: 18px; padding: 16px; }.duplicate-row { display: flex; align-items: flex-start; gap: 10px; border-top: 1px solid var(--line); padding: 12px 0; margin-top: 10px; cursor: pointer; }.duplicate-row strong { display: block; font-size: 14px; line-height: 1.8; }.duplicate-row span { color: var(--muted); font-size: 12px; line-height: 1.8; }.duplicate-row input { margin-top: 6px; }.maintenance-actions,.preview-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 20px; }.maintenance-error { padding: 12px; background: var(--blue-soft); border-radius: 14px; margin-top: 16px; font-size: 13px; line-height: 1.8; }.preview { margin-top: 24px; border-top: 1px solid var(--line); padding-top: 20px; }.preview > header > span { color: var(--blue-dark); font-size: 13px; }.change { margin-top: 14px; border: 0; border-radius: 16px; padding: 14px; background: var(--white); }summary { cursor: pointer; font-size: 13px; line-height: 1.8; }.change p { font-size: 13px; line-height: 1.8; margin-top: 12px; }.diff-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; margin-top: 14px; }.diff-grid > div { min-width: 0; }h4 { font-size: 12px; color: var(--muted); margin-bottom: 8px; }pre { max-height: 320px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; padding: 12px; border-radius: 12px; background: var(--paper); color: var(--ink); font-size: 12px; line-height: 1.8; }.history { margin-top: 24px; border-top: 1px solid var(--line); padding-top: 14px; }.history-row { padding: 16px 0; border-bottom: 1px solid var(--line); }.history-row strong { font-size: 13px; }
@media(max-width:720px) { .maintenance { padding: 0; }.form-grid,.diff-grid { grid-template-columns: 1fr; }.maintenance-actions > .pill:not(.compact-button),.preview-actions > .pill { width: 100%; justify-content: center; }.duplicate-groups { padding: 12px; } }
</style>
