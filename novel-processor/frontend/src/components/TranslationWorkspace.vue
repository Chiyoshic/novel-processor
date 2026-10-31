<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { api, type AiModelConfig } from '@/api'
import type { NovelRecord } from '@/lib'
import type { TranslationInitialization } from '@shared/translation'
import { reasoningLevels, type ReasoningLevel } from '@shared/ai'
import { notify } from '@/stores/toast'
import TranslationBriefView from './TranslationBriefView.vue'
import TranslationTaskPanel from './TranslationTaskPanel.vue'
import { applyTranslationEvent, finishTranslationTask, newTranslationTask, type TranslationTaskState } from '@/lib/translationTask'

const props = defineProps<{ catalog: NovelRecord }>()
const loading = ref(true)
const saving = ref(false)
const task = ref<TranslationTaskState | null>(null)
let generation: AbortController | undefined
const error = ref('')
const models = ref<AiModelConfig[]>([])
const saved = ref<TranslationInitialization | null>(null)
const editing = ref(false)
const form = ref({ modelId: 0, chapterCount: Math.min(3, props.catalog.chapters.length || props.catalog.episodes.length), includeSummary: true, includePreface: true, requirements: '', reasoningLevel: 'inherit' as ReasoningLevel | 'inherit' })
const selectedModel = computed(() => models.value.find((model) => model.id === form.value.modelId))
const levels = computed(() => reasoningLevels(selectedModel.value?.reasoningDialect ?? 'none'))
const maxCount = computed(() => props.catalog.chapters.length || props.catalog.episodes.length)
const unit = computed(() => props.catalog.chapters.length ? '章' : '话')
const sample = computed(() => {
  const count = form.value.chapterCount
  if (!Number.isInteger(count) || count < 1 || count > maxCount.value) return []
  if (!props.catalog.chapters.length) return props.catalog.episodes.slice(0, count)
  const end = props.catalog.chapters[count - 1].episodeEnd
  return props.catalog.episodes.filter((episode) => episode.index <= end)
})
watch(() => form.value.modelId, () => { form.value.reasoningLevel = 'inherit' })

async function load(): Promise<void> {
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
        form.value = { modelId: previous.modelId, chapterCount: previous.chapterCount, includeSummary: previous.includeSummary, includePreface: previous.includePreface, requirements: previous.requirements, reasoningLevel: 'inherit' }
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
  if (saving.value || !selectedModel.value || !sample.value.length) return
  saving.value = true
  error.value = ''
  const controller = new AbortController()
  generation = controller
  const model = selectedModel.value
  task.value = newTranslationTask({ modelName: model.name, model: model.model, apiType: model.apiType, reasoningLevel: form.value.reasoningLevel === 'inherit' ? model.reasoningLevel : form.value.reasoningLevel, episodeCount: sample.value.length })
  try {
    const { site, novelId } = props.catalog.source
    const reasoningLevel = form.value.reasoningLevel === 'inherit' ? undefined : form.value.reasoningLevel
    saved.value = await api.streamTranslation(site, novelId, { modelId: form.value.modelId, chapterCount: form.value.chapterCount, includeSummary: form.value.includeSummary, includePreface: form.value.includePreface, requirements: form.value.requirements, ...(reasoningLevel ? { reasoningLevel } : {}) }, (event) => { if (task.value) applyTranslationEvent(task.value, event) }, controller.signal)
    editing.value = false
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

onMounted(() => void load())
onUnmounted(() => generation?.abort())
</script>

<template>
  <section class="translation-workspace" aria-labelledby="translation-title">
      <header class="workspace-head">
        <h2 id="translation-title">初始化翻译材料</h2>
        <button v-if="saved && !loading" class="pill pill--ghost pill--small" type="button" :disabled="saving" :aria-expanded="editing" @click="editing = !editing">{{ editing ? '收起配置' : '重新初始化' }}</button>
      </header>
      <p v-if="loading" class="message" role="status">读取翻译材料…</p>
      <form v-else-if="!saved || editing" @submit.prevent="generate">
        <fieldset :disabled="saving">
          <label>使用模型<select v-model.number="form.modelId" required><option :value="0" disabled>请选择模型</option><option v-for="model in models" :key="model.id" :value="model.id">{{ model.name }} · {{ model.model }}</option></select></label>
          <div class="form-row"><label>取前多少{{ unit }}<input v-model.number="form.chapterCount" type="number" min="1" :max="maxCount" step="1" required /></label><label>本次思考等级<select v-model="form.reasoningLevel"><option value="inherit">沿用模型配置（{{ selectedModel?.reasoningLevel ?? 'default' }}）</option><option v-for="level in levels" :key="level" :value="level">{{ level === 'default' ? '默认' : level === 'off' ? '关闭' : level }}</option></select></label></div>
          <p class="hint">共 {{ maxCount }} {{ unit }}，按目录顺序选取；本次将读取 {{ sample.length }} 话正文。请先在详情页下载这一范围。未分章作品按话选取。</p>
          <div class="checks"><label><input v-model="form.includeSummary" type="checkbox" />作品简介</label><label><input v-model="form.includePreface" type="checkbox" />所选各话的前言（如有）</label></div>
          <label>翻译要求（可选）<textarea v-model="form.requirements" rows="3" maxlength="10000" placeholder="例如：简体中文，保留轻小说对白节奏；人名优先音译；避免过度网络化。" /></label>
        </fieldset>
        <p v-if="!models.length" class="message">尚无启用的模型。<RouterLink to="/settings">前往模型管理</RouterLink></p>
        <p v-if="saved" class="hint">重新生成仅在成功后替换当前概要，失败会保留原有内容。</p>
        <div class="actions"><button class="pill" type="submit" :disabled="saving || !selectedModel || !sample.length">{{ saving ? '正在阅读材料并生成…' : saved ? '重新生成概要' : '开始初始化' }}</button></div>
      </form>
      <TranslationTaskPanel v-if="task" :task="task" @cancel="generation?.abort()" />
      <div v-if="error" class="error" role="alert">{{ error }}<button class="pill pill--ghost pill--small" type="button" :disabled="saving" @click="load">重新读取</button></div>
      <TranslationBriefView v-if="saved" class="result" :saved="saved" @export="exportJson" />
  </section>
</template>

<style scoped>
.translation-workspace {
  min-width: 0;
  padding: 28px;
  border-radius: var(--radius-lg);
  background: var(--white);
  color: var(--ink);
  box-shadow: var(--shadow-soft);
}
.workspace-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
h2 { margin: 0; font-size: 23px; letter-spacing: 0; }

form { margin-top: 24px; }
fieldset { display: grid; gap: 18px; border: 0; margin: 0; padding: 0; min-width: 0; }
label { display: grid; gap: 8px; color: var(--muted); font-size: 12px; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
input:not([type='checkbox']), select, textarea { width: 100%; min-width: 0; border-radius: 14px; padding: 12px; background: var(--paper); color: var(--ink); font: inherit; font-size: 14px; }
textarea { resize: vertical; }
input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--blue-dark); outline-offset: 2px; }
.checks { display: flex; gap: 16px; flex-wrap: wrap; }
.checks label { display: flex; align-items: center; gap: 8px; }
input[type='checkbox'] { accent-color: var(--blue); }
.hint { font-size: 12px; line-height: 1.7; color: var(--muted); }
.actions { margin: 20px 0 12px; }
.actions .pill { padding-inline: 20px; justify-content: center; }
.message, .error { padding: 14px; margin-top: 16px; background: var(--blue-soft); border-radius: 14px; font-size: 13px; line-height: 1.8; }
.message a { text-decoration: underline; }
.result { margin-top: 28px; padding-top: 24px; border-top: 1px solid var(--line); }
@media (max-width: 720px) {
  .translation-workspace { padding: 22px 16px; }
  .form-row { grid-template-columns: 1fr; }
  input:not([type='checkbox']), select, textarea { font-size: 16px; }
  .workspace-head { flex-wrap: wrap; }
  .actions .pill { width: 100%; justify-content: center; }
}
</style>
