<script setup lang="ts">
import NormalButton from '@/components/NormalButton.vue'
import PillMultiSelect from './PillMultiSelect.vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { api, type AiModelConfig } from '@/api'
import type { NovelRecord } from '@/lib'
import type { TranslationInitialization } from '@shared/translation'
import { reasoningLevels, type ReasoningLevel } from '@shared/ai'
import { notify } from '@/stores/toast'
import BriefMaintenance from './BriefMaintenance.vue'
import TranslationBriefView from './TranslationBriefView.vue'
import TranslationTaskPanel from './TranslationTaskPanel.vue'
import { applyTranslationEvent, finishTranslationTask, newTranslationTask, type TranslationTaskState } from '@/lib/translationTask'

const props = defineProps<{ catalog: NovelRecord }>()
const loading = ref(true)
const saving = ref(false)
const maintaining = ref(false)
const task = ref<TranslationTaskState | null>(null)
let generation: AbortController | undefined
const error = ref('')
const models = ref<AiModelConfig[]>([])
const saved = ref<TranslationInitialization | null>(null)
const workspaceTab = ref<'task' | 'maintenance' | 'materials'>('task')
const form = ref({ modelId: 0, chapterCount: Math.min(3, props.catalog.episodes.length), includeSummary: true, includePreface: true, requirements: '', reasoningLevel: 'inherit' as ReasoningLevel | 'inherit' })
const selectedModel = computed(() => models.value.find((model) => model.id === form.value.modelId))
const levels = computed(() => reasoningLevels(selectedModel.value?.reasoningDialect ?? 'none'))
const maxCount = computed(() => props.catalog.episodes.length)
const sample = computed(() => {
  const count = form.value.chapterCount
  if (!Number.isInteger(count) || count < 1 || count > maxCount.value) return []
  return props.catalog.episodes.slice(0, count)
})
type MaterialOption = 'summary' | 'preface'
const materialOptions: { value: MaterialOption; label: string }[] = [
  { value: 'summary', label: '作品简介' },
  { value: 'preface', label: '所选各话的前言（如有）' },
]
const selectedMaterials = computed<Set<MaterialOption>>({
  get: () => new Set<MaterialOption>([
    ...(form.value.includeSummary ? ['summary' as const] : []),
    ...(form.value.includePreface ? ['preface' as const] : []),
  ]),
  set: (values) => {
    form.value.includeSummary = values.has('summary')
    form.value.includePreface = values.has('preface')
  },
})
watch(() => form.value.modelId, () => { form.value.reasoningLevel = 'inherit' })

async function load(): Promise<void> {
  if (saving.value || maintaining.value) return
  loading.value = true
  error.value = ''
  try {
    const { site, novelId } = props.catalog.source
    const [modelResult, savedResult] = await Promise.allSettled([api.aiModels(), api.translationInitialization(site, novelId)])
    models.value = modelResult.status === 'fulfilled' ? modelResult.value.filter((model) => model.enabled) : []
    // Reading saved material must not depend on model management being available.
    if (savedResult.status === 'fulfilled') {
      saved.value = savedResult.value
      if (saved.value) {
        const previous = saved.value.request
        form.value = { modelId: previous.modelId, chapterCount: Math.min(maxCount.value, previous.selectionUnit === 'episode' ? previous.chapterCount : previous.episodes.length), includeSummary: previous.includeSummary, includePreface: previous.includePreface, requirements: previous.requirements, reasoningLevel: 'inherit' }
        await nextTick() // restore the override after the model watcher resets it
        form.value.reasoningLevel = previous.reasoningLevel ?? 'inherit'
      }
    }
    if (!models.value.some((model) => model.id === form.value.modelId)) form.value.modelId = models.value[0]?.id ?? 0
    const failures = [modelResult, savedResult].filter((result) => result.status === 'rejected')
    if (failures.length) error.value = failures.map((result) => result.status === 'rejected' ? (result.reason instanceof Error ? result.reason.message : '读取失败，请重试') : '').join('；')
  } catch (err) { error.value = err instanceof Error ? err.message : '读取失败，请重试' }
  finally { loading.value = false }
}

async function generate(): Promise<void> {
  if (saving.value || maintaining.value || !selectedModel.value || !sample.value.length) return
  saving.value = true
  error.value = ''
  const controller = new AbortController()
  generation = controller
  const model = selectedModel.value
  task.value = newTranslationTask({ modelName: model.name, model: model.model, apiType: model.apiType, reasoningLevel: form.value.reasoningLevel === 'inherit' ? model.reasoningLevel : form.value.reasoningLevel, episodeCount: sample.value.length })
  try {
    const { site, novelId } = props.catalog.source
    const reasoningLevel = form.value.reasoningLevel === 'inherit' ? undefined : form.value.reasoningLevel
    saved.value = await api.streamTranslation(site, novelId, { modelId: form.value.modelId, chapterCount: form.value.chapterCount, selectionUnit: 'episode', includeSummary: form.value.includeSummary, includePreface: form.value.includePreface, requirements: form.value.requirements, ...(reasoningLevel ? { reasoningLevel } : {}) }, (event) => { if (task.value) applyTranslationEvent(task.value, event) }, controller.signal)
    notify('翻译材料已保存至 SQLite')
  } catch (err) {
    const message = controller.signal.aborted ? '任务已停止；若刚好在保存阶段断开，请重新读取确认保存状态。' : err instanceof Error ? err.message : '初始化失败'
    if (task.value) finishTranslationTask(task.value, controller.signal.aborted ? 'cancelled' : 'failed', message)
    if (!controller.signal.aborted) error.value = message
  }
  finally { generation = undefined; saving.value = false }
}

function exportJson(): void {
  if (!saved.value) return
  const url = URL.createObjectURL(new Blob([JSON.stringify(saved.value, null, 2)], { type: 'application/json;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${props.catalog.source.novelId}-translation-brief.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

defineExpose({ reload: load })
onMounted(() => void load())
onUnmounted(() => generation?.abort())
</script>

<template>
  <section class="translation-workspace" aria-label="初始化翻译材料">
      <AppTabs v-model="workspaceTab" class="workspace-tabs" variant="secondary" block label="初始化材料模块" :options="[{ value: 'task', label: '创建任务' }, { value: 'maintenance', label: '材料维护' }, { value: 'materials', label: '浏览材料' }]" />
      <div class="workspace-card" :class="{ 'workspace-card--book': workspaceTab === 'materials' }">
      <p v-if="loading" class="message" role="status">读取翻译材料…</p>
      <div v-if="error" class="error" role="alert">{{ error }}<NormalButton small variant="ghost" type="button" :disabled="saving || maintaining" @click="load">重新读取</NormalButton></div>
      <div v-show="workspaceTab === 'task'" class="workspace-module" role="region" aria-label="创建任务">
      <form v-if="!loading" @submit.prevent="generate">
        <fieldset :disabled="saving || maintaining">
          <label><span class="form-section-title">使用模型</span><AppSelect soft-shadow v-model="form.modelId" block required label="使用模型" :options="[{ value: 0, label: '请选择模型', disabled: true }, ...models.map(model => ({ value: model.id, label: model.name, hint: model.model }))]" /></label>
          <div class="form-row"><label><span class="form-section-title">前多少话</span><input v-model.number="form.chapterCount" type="number" min="1" :max="maxCount" step="1" required /></label><label><span class="form-section-title">本次思考等级</span><AppSelect soft-shadow v-model="form.reasoningLevel" block label="本次思考等级" :options="[{ value: 'inherit', label: `沿用模型配置（${selectedModel?.reasoningLevel ?? 'default'}）` }, ...levels.map(level => ({ value: level, label: level === 'default' ? '默认' : level === 'off' ? '关闭' : level }))]" /></label></div>
          <PillMultiSelect v-model="selectedMaterials" label="附加材料" :options="materialOptions" :disabled="saving || maintaining" />
          <label><span class="form-section-title">翻译要求（可选）</span><textarea v-model="form.requirements" rows="3" maxlength="10000" placeholder="例如：简体中文，保留轻小说对白节奏；人名优先音译；避免过度网络化。" /></label>
        </fieldset>
        <p v-if="!models.length" class="message">尚无启用的模型。<RouterLink to="/settings">前往模型管理</RouterLink></p>
        <div class="actions"><NormalButton type="submit" :disabled="saving || maintaining || !selectedModel || !sample.length">{{ saving ? '正在阅读材料并生成…' : saved ? '重新生成概要' : '开始初始化' }}</NormalButton></div>
      </form>
      <TranslationTaskPanel v-if="task" :task="task" @cancel="generation?.abort()" />
      </div>
      <!-- 使用 v-show 保留任务流、维护任务及预览状态，切换 tab 不取消请求。 -->
      <div v-show="workspaceTab === 'maintenance'" class="workspace-module" role="region" aria-label="材料维护">
        <template v-if="saved">
          <BriefMaintenance :saved="saved" :models="models" :disabled="saving" @busy="maintaining = $event" @updated="saved = $event" />
        </template>
        <div v-else-if="!loading" class="empty-materials">
          <p>暂无初始化材料，请先创建任务。</p>
          <NormalButton small variant="secondary" @click="workspaceTab = 'task'">创建任务</NormalButton>
        </div>
      </div>
      <div v-show="workspaceTab === 'materials'" class="workspace-module" role="region" aria-label="浏览材料">
        <template v-if="saved">
          <TranslationBriefView class="result" :saved="saved" @export="exportJson" />
        </template>
        <div v-else-if="!loading" class="empty-materials">
          <p>暂无已保存的翻译材料，请先创建任务。</p>
          <NormalButton small variant="secondary" @click="workspaceTab = 'task'">创建任务</NormalButton>
        </div>
      </div>
      </div>
  </section>
</template>

<style scoped>
.translation-workspace {
  min-width: 0;
  color: var(--ink);
}
.workspace-card {
  min-width: 0;
  margin-top: 20px;
  padding: 28px;
  border-radius: var(--radius-lg);
  background: var(--white);
  color: var(--ink);
  box-shadow: var(--shadow-soft);
}

.workspace-card.workspace-card--book {
  background: transparent;
  border-radius: 0;
  box-shadow: none;
}
.workspace-card--book .workspace-module { max-width: 46rem; margin-inline: auto; }
.workspace-card--book .empty-materials { font-family: var(--serif-sc); }

.workspace-tabs { margin-top: 20px; }
.workspace-module { min-width: 0; }
.empty-materials { display: grid; justify-items: start; gap: 14px; padding: 24px 0; color: var(--muted); font-size: 13px; }
form { margin: 0; }
.workspace-module > :first-child { margin-top: 0; }
fieldset { display: grid; gap: 18px; border: 0; margin: 0; padding: 0; min-width: 0; }
label { min-width: 0; display: grid; gap: 8px; color: var(--muted); font-size: 12px; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
input:not([type='checkbox']), textarea { width: 100%; min-width: 0; border-radius: 14px; padding: 12px; background: var(--paper); color: var(--ink); font: inherit; font-size: 14px; }
textarea { resize: vertical; }
input:focus-visible, textarea:focus-visible { outline: 2px solid var(--blue-dark); outline-offset: 2px; }
.hint { font-size: 12px; line-height: 1.7; color: var(--muted); }
.actions { margin: 20px 0 12px; }
.actions .pill { padding-inline: 20px; justify-content: center; }
.message, .error { padding: 14px; margin-top: 16px; background: var(--blue-soft); border-radius: 14px; font-size: 13px; line-height: 1.8; }
.message a { text-decoration: underline; }
.result { margin-top: 0; padding-top: 0; }
@media (max-width: 720px) {
  .workspace-card { padding: 22px 16px; }
  .form-row { grid-template-columns: 1fr; }
  input:not([type='checkbox']), textarea { font-size: 16px; }
  .workspace-head { flex-wrap: wrap; }
  .actions .pill { width: 100%; justify-content: center; }
}
</style>
