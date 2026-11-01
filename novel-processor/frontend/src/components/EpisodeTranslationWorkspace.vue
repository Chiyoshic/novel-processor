<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { api, type AiModelConfig } from '@/api'
import type { NovelRecord } from '@/lib'
import type { EpisodeTranslationsResponse, EpisodeTranslationStatus } from '@shared/episode-translation'
import { DEFAULT_REFERENCE_EPISODE_COUNT, MAX_REFERENCE_EPISODE_COUNT, episodeTranslationLabels } from '@shared/episode-translation'
import type { TranslationInitialization } from '@shared/translation'
import { reasoningLevels, type ReasoningLevel } from '@shared/ai'
import TranslationTaskPanel from './TranslationTaskPanel.vue'
import { applyTranslationEvent, newTranslationTask, finishTranslationTask, type TranslationTaskState } from '@/lib/translationTask'

const props = defineProps<{ catalog: NovelRecord }>()
const emit = defineEmits<{ 'baseline-updated': [] }>()
const loading = ref(true)
const error = ref('')
const submitting = ref(false)
const stopping = ref(false)
const models = ref<AiModelConfig[]>([])
const baseline = ref<TranslationInitialization | null>(null)
const snapshot = ref<EpisodeTranslationsResponse>({ episodes: [], job: null })
const downloaded = ref(new Set<number>())
const selected = ref(new Set<number>())
const filter = ref('all')
const form = ref({ modelId: 0, referenceEpisodeCount: DEFAULT_REFERENCE_EPISODE_COUNT, overwrite: false, requirements: '', reasoningLevel: 'inherit' as ReasoningLevel | 'inherit' })
const model = computed(() => models.value.find((item) => item.id === form.value.modelId))
const levels = computed(() => reasoningLevels(model.value?.reasoningDialect ?? 'none'))
const statuses = computed(() => new Map(snapshot.value.episodes.map((item) => [item.index, item])))
const running = computed(() => snapshot.value.job?.running === true)
const job = computed(() => snapshot.value.job)
const completedCount = computed(() => snapshot.value.episodes.filter((item) => item.hasTranslation && item.status !== 'stale').length)
const settled = computed(() => job.value ? job.value.done.length + job.value.failed.length + job.value.skipped.length + job.value.cancelled.length : 0)
const selectable = computed(() => props.catalog.episodes.filter((episode) => downloaded.value.has(episode.index) && (form.value.overwrite || !statuses.value.get(episode.index)?.hasTranslation || statuses.value.get(episode.index)?.status === 'stale')))
const allowedIndices = computed(() => new Set(selectable.value.map((episode) => episode.index)))
const visible = computed(() => props.catalog.episodes.filter((episode) => filter.value === 'all' || filter.value === 'pending' && !statuses.value.get(episode.index)?.hasTranslation || filter.value === 'translated' && statuses.value.get(episode.index)?.hasTranslation || filter.value === 'failed' && statuses.value.get(episode.index)?.status === 'failed'))
const groups = computed(() => {
  if (!props.catalog.chapters.length) return [{ index: 0, title: '全部话', episodes: visible.value }]
  const result = props.catalog.chapters.map((chapter) => ({ index: chapter.index, title: chapter.title, episodes: visible.value.filter((episode) => episode.chapterIndex === chapter.index) }))
  const loose = visible.value.filter((episode) => episode.chapterIndex === null)
  return (loose.length ? [{ index: 0, title: '未分章', episodes: loose }, ...result] : result).filter((group) => group.episodes.length)
})
const warnings = computed(() => snapshot.value.episodes.filter((item) => job.value?.done.includes(item.index) && (item.warnings.length || item.updates.length)))
const task = computed<TranslationTaskState | null>(() => {
  const current = job.value?.current
  if (!current || !job.value) return null
  const value = newTranslationTask({ modelName: job.value.modelName, model: job.value.model, apiType: job.value.apiType, reasoningLevel: job.value.reasoningLevel, episodeCount: 1 })
  value.limits = job.value.limits
  value.maxAttempts = job.value.limits.maxAttempts
  value.referenceEpisodeIndex = current.referenceEpisodeIndex
  value.referenceEpisodeIndices = current.referenceEpisodeIndices
  value.referenceEpisodeCount = job.value.referenceEpisodeCount
  value.startedAt = current.startedAt
  value.lastEventAt = current.startedAt
  value.logs = [{ at: current.startedAt, message: `第 ${current.index} 话 · ${current.title}` }]
  for (const event of current.events) applyTranslationEvent(value, event)
  value.lastEventAt = current.lastEventAt
  if (current.status === 'translated') { value.status = 'completed'; value.finishedAt = current.finishedAt ?? undefined }
  else if (current.status === 'failed' || current.status === 'cancelled') {
    finishTranslationTask(value, current.status, statuses.value.get(current.index)?.error ?? '本话翻译已停止')
    value.finishedAt = current.finishedAt ?? value.finishedAt
  }
  return value
})
let poll: ReturnType<typeof setTimeout> | undefined
let alive = true
let seenCompleted = ''
function statusLabel(value?: EpisodeTranslationStatus): string { return value ? episodeTranslationLabels[value.status] : '未翻译' }
function allowed(index: number): boolean { return allowedIndices.value.has(index) }
function toggle(index: number): void { const value = new Set(selected.value); if (value.has(index)) value.delete(index); else value.add(index); selected.value = value }
function selectGroup(indices: number[]): void { const value = new Set(selected.value); const allowedIndices = indices.filter(allowed); const remove = allowedIndices.every((index) => value.has(index)); for (const index of allowedIndices) { if (remove) value.delete(index); else value.add(index) }; selected.value = value }
watch(() => form.value.modelId, () => { form.value.reasoningLevel = 'inherit' })
watch(() => form.value.overwrite, () => { selected.value = new Set([...selected.value].filter(allowed)) })
async function refresh(): Promise<void> {
  const next = await api.episodeTranslations(props.catalog.source.site, props.catalog.source.novelId)
  if (!alive) return
  snapshot.value = next
  if (next.job && !next.job.running && seenCompleted !== next.job.id) { seenCompleted = next.job.id; emit('baseline-updated'); baseline.value = await api.translationInitialization(props.catalog.source.site, props.catalog.source.novelId) }
}
async function pollProgress(): Promise<void> {
  try { await refresh() } catch (err) { if (alive) error.value = err instanceof Error ? err.message : '读取任务状态失败' }
  finally { if (alive) poll = setTimeout(() => void pollProgress(), running.value ? 1000 : 4000) }
}
async function load(): Promise<void> {
  loading.value = true; error.value = ''
  try {
    const { site, novelId } = props.catalog.source
    const [configs, existing, progress] = await Promise.all([api.aiModels(), api.translationInitialization(site, novelId), api.progress(site, novelId)])
    if (!alive) return
    models.value = configs.filter((item) => item.enabled); baseline.value = existing; downloaded.value = new Set(progress.indices)
    form.value.modelId = models.value.find((item) => item.id === existing?.modelId)?.id ?? models.value[0]?.id ?? 0
    await refresh()
  } catch (err) { error.value = err instanceof Error ? err.message : '读取翻译流程失败' }
  finally { loading.value = false }
}
async function start(): Promise<void> {
  if (!selected.value.size || !model.value || !baseline.value || submitting.value || running.value) return
  submitting.value = true; error.value = ''
  try {
    const { site, novelId } = props.catalog.source
    const reasoningLevel = form.value.reasoningLevel === 'inherit' ? undefined : form.value.reasoningLevel
    snapshot.value = await api.translateEpisodes(site, novelId, { modelId: form.value.modelId, indices: [...selected.value], referenceEpisodeCount: form.value.referenceEpisodeCount, overwrite: form.value.overwrite, requirements: form.value.requirements, ...(reasoningLevel ? { reasoningLevel } : {}) })
    selected.value = new Set()
    if (poll) clearTimeout(poll)
    poll = setTimeout(() => void pollProgress(), 300)
  } catch (err) { error.value = err instanceof Error ? err.message : '启动失败' }
  finally { submitting.value = false }
}
async function stop(): Promise<void> {
  stopping.value = true
  try { snapshot.value = await api.stopEpisodeTranslation(props.catalog.source.site, props.catalog.source.novelId) }
  catch (err) { error.value = err instanceof Error ? err.message : '停止失败' }
  finally { stopping.value = false }
}
onMounted(async () => { await load(); if (alive) void pollProgress() })
onUnmounted(() => { alive = false; if (poll) clearTimeout(poll) })
</script>

<template>
  <section class="episode-workspace" aria-labelledby="episodes-translation-title">
    <header class="workspace-head"><div><p class="eyebrow">第二步</p><h2 id="episodes-translation-title">章节翻译</h2></div><span class="total-chip">已翻译 {{ completedCount }} / {{ catalog.episodes.length }} 话</span></header>
    <p v-if="loading" class="notice" role="status">读取章节与翻译材料…</p>
    <template v-else>
      <p v-if="!baseline" class="notice">请先完成第一步的初始化翻译材料。</p>
      <p v-if="error" class="notice error" role="alert">{{ error }} <button class="pill pill--ghost pill--small" type="button" @click="load">重新读取</button></p>
      <form @submit.prevent="start">
        <fieldset :disabled="running || submitting || !baseline"><div class="form-grid"><label>翻译模型<select v-model.number="form.modelId"><option :value="0" disabled>请选择模型</option><option v-for="item in models" :key="item.id" :value="item.id">{{ item.name }} · {{ item.model }}</option></select></label><label>思考等级<select v-model="form.reasoningLevel"><option value="inherit">沿用模型配置（{{ model?.reasoningLevel ?? 'default' }}）</option><option v-for="level in levels" :key="level" :value="level">{{ level }}</option></select></label><label>最近译文参考数量<input v-model.number="form.referenceEpisodeCount" type="number" min="0" :max="MAX_REFERENCE_EPISODE_COUNT" step="1" required /><small>本话之前最近的已译话数，0 为关闭；不足时使用实际数量，跳过过期译文。</small></label></div><label>本次附加要求<textarea v-model="form.requirements" rows="2" maxlength="10000" placeholder="可选，默认沿用初始化翻译要求" /></label><label class="check-label"><input v-model="form.overwrite" type="checkbox" />允许重新翻译已有译文</label></fieldset>
        <div class="selection-toolbar"><div class="selection-actions"><button class="pill pill--ghost pill--small" type="button" :disabled="running" @click="selected = new Set(selectable.map((episode) => episode.index))">全选可翻译</button><button class="pill pill--ghost pill--small" type="button" :disabled="running" @click="selected = new Set()">清空选择</button><span>已选 {{ selected.size }} 话 · 按目录顺序串行</span></div><label class="filter-label">筛选<select v-model="filter"><option value="all">全部章节</option><option value="pending">未翻译</option><option value="translated">已有译文</option><option value="failed">翻译失败</option></select></label></div>
        <div class="chapter-list"><section v-for="group in groups" :key="group.index" class="chapter-group"><header><h3>{{ group.title }}</h3><button class="pill pill--ghost pill--small" type="button" :disabled="running" @click="selectGroup(group.episodes.map((episode) => episode.index))">选择本章</button></header><label v-for="episode in group.episodes" :key="episode.index" class="episode-row" :class="{ selected: selected.has(episode.index) }"><input type="checkbox" :checked="selected.has(episode.index)" :disabled="running || !allowed(episode.index)" @change="toggle(episode.index)" /><span class="episode-number">{{ episode.index }}</span><span class="episode-title">{{ episode.title }}<small v-if="statuses.get(episode.index)?.error">{{ statuses.get(episode.index)?.error }}</small></span><span class="state-badge">{{ !downloaded.has(episode.index) ? '未下载' : statusLabel(statuses.get(episode.index)) }}</span><RouterLink v-if="statuses.get(episode.index)?.hasTranslation" class="read-link" :to="{ name: 'reader', params: { site: catalog.source.site, novelId: catalog.source.novelId, index: episode.index }, query: { language: 'translation' } }" @click.stop>译文 ↗</RouterLink></label></section><p v-if="!groups.length" class="empty">没有匹配的章节。</p></div>
        <div class="submit-row"><button class="pill" type="submit" :disabled="!baseline || !selected.size || !model || running || submitting">{{ submitting ? '正在创建任务…' : `开始翻译 ${selected.size} 话` }}</button><p class="hint">任务在后端串行执行，离开页面不中断；每话完成即保存，失败的话不影响后续。</p></div>
      </form>
      <section v-if="job" class="batch-summary"><div class="batch-heading"><h3>{{ job.running ? `正在翻译 · 第 ${job.current?.index ?? '—'} 话` : '本次任务已结束' }}</h3><button v-if="job.running" class="pill pill--ghost pill--small" type="button" :disabled="stopping || job.stopping" @click="stop">{{ job.stopping || stopping ? '正在停止…' : '停止批量任务' }}</button></div><progress :value="settled" :max="job.indices.length" /><div class="batch-counts"><span>完成 {{ job.done.length }}</span><span>失败 {{ job.failed.length }}</span><span>跳过 {{ job.skipped.length }}</span><span>停止 {{ job.cancelled.length }}</span><span>{{ settled }} / {{ job.indices.length }}</span></div><ul v-if="job.failed.length" class="failures"><li v-for="item in job.failed" :key="item.index">第 {{ item.index }} 话：{{ item.error }}</li></ul></section>
      <TranslationTaskPanel v-if="task" :task="task" :title="`第 ${job?.current?.index} 话 · 实时翻译`" @cancel="stop" />
      <section v-if="warnings.length" class="updates-section"><h3>翻译材料变更</h3><details v-for="item in warnings" :key="item.index"><summary>第 {{ item.index }} 话 · 应用 {{ item.updates.filter((update) => update.status === 'applied').length }} 条 · 忽略 {{ item.updates.filter((update) => update.status === 'ignored').length }} 条</summary><ul><li v-for="(warning, index) in item.warnings" :key="`warning-${index}`" class="warning">{{ warning }}</li><li v-for="update in item.updates" :key="update.position">#{{ update.position + 1 }} · {{ update.field }}{{ update.index !== undefined ? `[${update.index}]` : '' }} · {{ update.action }} · {{ update.message }}</li></ul></details></section>
    </template>
  </section>
</template>

<style scoped>
.episode-workspace { min-width: 0; background: var(--white); color: var(--ink); padding: 28px; border-radius: var(--radius-lg); box-shadow: var(--shadow-soft); }
.workspace-head, .batch-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }h2 { font-size: 23px; margin-top: 8px; }h3 { font-size: 15px; line-height: 1.7; }.total-chip, .state-badge { padding: 5px 11px; border-radius: 999px; font-size: 12px; background: var(--blue-soft); color: var(--blue-dark); white-space: nowrap; }
form { margin-top: 24px; }fieldset { border: 0; padding: 0; margin: 0; display: grid; gap: 16px; min-width: 0; }label { font-size: 12px; color: var(--muted); }fieldset label { display: grid; gap: 8px; }.form-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; }select, textarea, input[type=number] { width: 100%; min-width: 0; background: var(--paper); color: var(--ink); border: 1px solid var(--line); padding: 12px; border-radius: 14px; font: inherit; font-size: 14px; }textarea { resize: vertical; }fieldset small { line-height: 1.8; font-size: 11px; color: var(--muted); }fieldset .check-label { display: flex; align-items: center; gap: 8px; }input[type=checkbox] { accent-color: var(--blue-dark); width: 16px; height: 16px; flex-shrink: 0; }
.selection-toolbar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin: 24px 0 14px; }.selection-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }.selection-actions > span { font-size: 12px; color: var(--muted); }.filter-label { display: flex; align-items: center; gap: 8px; }.filter-label select { width: auto; min-height: 40px; padding: 8px 12px; }
.chapter-list { max-height: 560px; overflow: auto; border: 1px solid var(--line); border-radius: 20px; }.chapter-group + .chapter-group { border-top: 1px solid var(--line); }.chapter-group > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; background: var(--paper); }.episode-row { display: flex; align-items: center; gap: 10px; padding: 13px 16px; border-top: 1px solid var(--line); cursor: pointer; }.episode-row.selected { background: var(--blue-soft); }.episode-number { font-size: 12px; min-width: 24px; font-variant-numeric: tabular-nums; }.episode-title { flex: 1; min-width: 0; color: var(--ink); font-size: 14px; line-height: 1.8; overflow-wrap: anywhere; }.episode-title small { display: block; font-size: 11px; color: var(--muted); }.state-badge { font-size: 11px; padding: 3px 9px; }.read-link { color: var(--blue-dark); white-space: nowrap; font-size: 12px; }
.submit-row { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 20px; }.hint { font-size: 12px; line-height: 1.8; color: var(--muted); flex: 1; min-width: 180px; }.notice { padding: 14px; background: var(--blue-soft); border-radius: 14px; margin-top: 18px; font-size: 13px; line-height: 1.8; }.empty { padding: 32px; font-size: 13px; color: var(--muted); text-align: center; }
.batch-summary { border: 1px solid var(--blue-line); background: var(--paper); padding: 20px; border-radius: 20px; margin-top: 24px; }progress { width: 100%; height: 8px; margin: 18px 0 12px; accent-color: var(--blue-dark); }.batch-counts { display: flex; flex-wrap: wrap; gap: 10px 18px; font-size: 12px; color: var(--muted); }.failures, .updates-section ul { padding-left: 18px; font-size: 12px; line-height: 1.9; margin-top: 12px; }.updates-section { margin-top: 24px; }.updates-section details { margin-top: 12px; padding: 12px 16px; border: 1px solid var(--line); background: var(--paper); border-radius: 16px; }summary { cursor: pointer; font-size: 13px; line-height: 1.8; }.warning { color: var(--blue-dark); }
@media(max-width:720px) { .episode-workspace { padding: 22px 16px; }.form-grid { grid-template-columns: 1fr; }select,textarea,input[type=number] { font-size: 16px; }.episode-row { flex-wrap: wrap; padding: 12px; gap: 8px; }.episode-title { flex-basis: calc(100% - 70px); }.state-badge { margin-left: 50px; }.read-link { margin-left: auto; }.chapter-group > header { padding: 12px; }.submit-row > button { width: 100%; justify-content: center; }.batch-summary { padding: 16px; } }
</style>
