<script setup lang="ts">
import NormalButton from '@/components/NormalButton.vue'
import CompactButton from './CompactButton.vue'
import PillMultiSelect from './PillMultiSelect.vue'
import { computed, onMounted, onUnmounted, ref, useId, watch } from 'vue'
import { selectEpisodeRange, selectFirstUntranslated } from '@shared/episode-selection'
import { api, type AiModelConfig } from '@/api'
import type { NovelRecord } from '@/lib'
import type { EpisodeTranslationsResponse } from '@shared/episode-translation'
import { DEFAULT_REFERENCE_EPISODE_COUNT, MAX_REFERENCE_EPISODE_COUNT } from '@shared/episode-translation'
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
const chapterListId = useId()
const collapsedChapters = ref(new Set<number>())
function toggleChapter(index: number): void {
  const next = new Set(collapsedChapters.value)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  collapsedChapters.value = next
}
const rangeStart = ref<number | string>(props.catalog.episodes[0]?.index ?? 1)
const rangeEnd = ref<number | string>(props.catalog.episodes.at(-1)?.index ?? 1)
const pendingCount = ref<number | string>(10)
const selectionMessage = ref('')
function selectRange(): void {
  if (running.value || submitting.value) return
  try {
    const indices = selectEpisodeRange(props.catalog.episodes.map((episode) => episode.index), allowedIndices.value, Number(rangeStart.value), Number(rangeEnd.value))
    if (indices.length > 1000) throw new Error('每批最多 1000 话，请缩小范围')
    selected.value = new Set(indices); filter.value = 'all'
    selectionMessage.value = `已选范围内 ${indices.length} 话；未下载及不允许重译的话已跳过。`
  } catch (error) { selectionMessage.value = error instanceof Error ? error.message : '范围无效' }
}
function selectPending(): void {
  if (running.value || submitting.value) return
  try {
    const translated = new Set(snapshot.value.episodes.filter((episode) => episode.hasTranslation && episode.status !== 'stale').map((episode) => episode.index))
    const indices = selectFirstUntranslated(props.catalog.episodes.map((episode) => episode.index), downloaded.value, translated, Number(pendingCount.value))
    selected.value = new Set(indices); filter.value = 'all'
    selectionMessage.value = indices.length ? `已选第 ${indices[0]} 话起的 ${indices.length} 话${indices.length < Number(pendingCount.value) ? '，可用未译话数不足，已全部选择' : ''}。` : '暂无已下载且需要翻译的话。'
  } catch (error) { selectionMessage.value = error instanceof Error ? error.message : '数量无效' }
}
const form = ref({ modelId: 0, referenceEpisodeCount: DEFAULT_REFERENCE_EPISODE_COUNT, overwrite: false, requirements: '', reasoningLevel: 'inherit' as ReasoningLevel | 'inherit' })
const translationOptions = computed<Set<string>>({
  get: () => new Set(form.value.overwrite ? ['overwrite'] : []),
  set: (values) => { form.value.overwrite = values.has('overwrite') },
})
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
    <header class="workspace-head"><div><h2 id="episodes-translation-title">章节翻译</h2></div><span class="total-chip">已翻译 {{ completedCount }} / {{ catalog.episodes.length }} 话</span></header>
    <p v-if="loading" class="notice" role="status">读取章节与翻译材料…</p>
    <template v-else>
      <p v-if="!baseline" class="notice">请先完成第一步的初始化翻译材料。</p>
      <p v-if="error" class="notice error" role="alert">{{ error }} <NormalButton small variant="ghost" type="button" @click="load">重新读取</NormalButton></p>
      <form class="config-section" id="episode-translation-config" @submit.prevent="start">
        <fieldset :disabled="running || submitting || !baseline"><div class="form-grid"><label><span class="form-section-title">翻译模型</span><AppSelect soft-shadow v-model="form.modelId" block label="翻译模型" :options="[{ value: 0, label: '请选择模型', disabled: true }, ...models.map(item => ({ value: item.id, label: item.name, hint: item.model }))]" /></label><label><span class="form-section-title">思考等级</span><AppSelect soft-shadow v-model="form.reasoningLevel" block label="思考等级" :options="[{ value: 'inherit', label: `沿用模型配置（${model?.reasoningLevel ?? 'default'}）` }, ...levels.map(level => ({ value: level, label: level }))]" /></label><label><span class="form-section-title">最近译文参考数量</span><input v-model.number="form.referenceEpisodeCount" type="number" min="0" :max="MAX_REFERENCE_EPISODE_COUNT" step="1" required /><small>本话之前最近的已译话数，0 为关闭；不足时使用实际数量，跳过过期译文。</small></label></div><label><span class="form-section-title">本次附加要求</span><textarea v-model="form.requirements" rows="2" maxlength="10000" placeholder="可选，默认沿用初始化翻译要求" /></label><PillMultiSelect v-model="translationOptions" label="翻译选项" :disabled="running || submitting || !baseline" :options="[{ value: 'overwrite', label: '允许重新翻译已有译文' }]" /></fieldset>
      </form>
      <section class="selection-section" aria-label="选择翻译章节">
        <fieldset class="quick-selection" :disabled="running || submitting || !baseline"><legend class="form-section-title">选择章节</legend><div class="quick-range"><label><span class="selection-field-title">起始话号</span><input v-model.number="rangeStart" @keydown.enter.prevent="selectRange" type="number" min="1" step="1" /></label><label><span class="selection-field-title">结束话号</span><input v-model.number="rangeEnd" @keydown.enter.prevent="selectRange" type="number" min="1" step="1" /></label><NormalButton variant="secondary" @click="selectRange">选择范围</NormalButton></div><div class="quick-pending"><label><span class="selection-field-title">从最小未译话号开始</span><input v-model.number="pendingCount" @keydown.enter.prevent="selectPending" type="number" min="1" max="1000" step="1" /></label><NormalButton variant="secondary" @click="selectPending">选择未译话</NormalButton></div><p>快捷选择替换当前勾选，仅选择已下载的话；过期译文视为待译。</p><p v-if="selectionMessage" role="status">{{ selectionMessage }}</p></fieldset>
        <div class="selection-toolbar"><div class="selection-actions"><CompactButton variant="secondary" :disabled="running || submitting || !baseline" @click="selected = new Set(selectable.map((episode) => episode.index))">全选</CompactButton><CompactButton variant="secondary" tone="danger" :disabled="running || submitting || !baseline" @click="selected = new Set()">清空</CompactButton><span>已选 {{ selected.size }} 话 · 按目录顺序串行</span></div><label class="filter-label"><span class="form-section-title">筛选</span><AppSelect size="compact" soft-shadow v-model="filter" label="章节筛选" :options="[{ value: 'all', label: '全部章节' }, { value: 'pending', label: '未翻译' }, { value: 'translated', label: '已有译文' }, { value: 'failed', label: '翻译失败' }]" /></label></div>
        <div class="chapter-list">
          <section v-for="group in groups" :key="group.index" class="chapter-group">
            <header><h3><button class="chapter-toggle" type="button" :aria-expanded="!collapsedChapters.has(group.index)" :aria-controls="`${chapterListId}-${group.index}`" @click="toggleChapter(group.index)"><span class="chapter-caret" :class="{ expanded: !collapsedChapters.has(group.index) }" aria-hidden="true">▸</span><span>{{ group.title }}</span><small>{{ group.episodes.length }} 话<span v-if="group.episodes.some((episode) => selected.has(episode.index))"> · 已选 {{ group.episodes.filter((episode) => selected.has(episode.index)).length }}</span></small></button></h3><CompactButton variant="secondary" :disabled="running || submitting || !baseline" @click="selectGroup(group.episodes.map((episode) => episode.index))">选择本章</CompactButton></header>
            <div v-show="!collapsedChapters.has(group.index)" :id="`${chapterListId}-${group.index}`">
            <div v-for="episode in group.episodes" :key="episode.index" class="episode-row" :class="{ selected: selected.has(episode.index) }">
              <label class="episode-selection" :title="!downloaded.has(episode.index) ? '正文尚未下载' : undefined">
                <input type="checkbox" :checked="selected.has(episode.index)" :disabled="running || submitting || !baseline || !allowed(episode.index)" @change="toggle(episode.index)" />
                <span class="episode-number">{{ episode.index }}</span>
                <span class="episode-title">{{ episode.title }}<small v-if="statuses.get(episode.index)?.error">{{ statuses.get(episode.index)?.error }}</small></span>
              </label>
              <RouterLink v-if="statuses.get(episode.index)?.hasTranslation" class="translation-icon-link" :aria-label="`阅读第 ${episode.index} 话译文`" title="阅读译文" :to="{ name: 'reader', params: { site: catalog.source.site, novelId: catalog.source.novelId, index: episode.index }, query: { language: 'translation' } }" @click.stop><span class="translation-icon" aria-hidden="true" /></RouterLink>
            </div>
            </div>
          </section>
          <p v-if="!groups.length" class="empty">没有匹配的章节。</p>
        </div>
        <div class="submit-row"><NormalButton type="submit" form="episode-translation-config" :disabled="!baseline || !selected.size || !model || running || submitting">{{ submitting ? '正在创建任务…' : `开始翻译 ${selected.size} 话` }}</NormalButton><p class="hint">任务在后端串行执行，离开页面不中断；每话完成即保存，失败的话不影响后续。</p></div>
      </section>
      <section v-if="job" class="batch-summary"><div class="batch-heading"><h3>{{ job.running ? `正在翻译 · 第 ${job.current?.index ?? '—'} 话` : '本次任务已结束' }}</h3><CompactButton variant="secondary" tone="danger" v-if="job.running" :disabled="stopping || job.stopping" @click="stop">{{ job.stopping || stopping ? '正在停止…' : '停止批量任务' }}</CompactButton></div><progress :value="settled" :max="job.indices.length" /><div class="batch-counts"><span>完成 {{ job.done.length }}</span><span>失败 {{ job.failed.length }}</span><span>跳过 {{ job.skipped.length }}</span><span>停止 {{ job.cancelled.length }}</span><span>{{ settled }} / {{ job.indices.length }}</span></div><ul v-if="job.failed.length" class="failures"><li v-for="item in job.failed" :key="item.index">第 {{ item.index }} 话：{{ item.error }}</li></ul></section>
      <TranslationTaskPanel v-if="task" :task="task" :title="`第 ${job?.current?.index} 话 · 实时翻译`" @cancel="stop" />
      <section v-if="warnings.length" class="updates-section"><h3>翻译材料变更</h3><details v-for="item in warnings" :key="item.index"><summary>第 {{ item.index }} 话 · 应用 {{ item.updates.filter((update) => update.status === 'applied').length }} 条 · 忽略 {{ item.updates.filter((update) => update.status === 'ignored').length }} 条</summary><ul><li v-for="(warning, index) in item.warnings" :key="`warning-${index}`" class="warning">{{ warning }}</li><li v-for="update in item.updates" :key="update.position">#{{ update.position + 1 }} · {{ update.field }}{{ update.index !== undefined ? `[${update.index}]` : '' }} · {{ update.action }} · {{ update.message }}</li></ul></details></section>
    </template>
  </section>
</template>

<style scoped>
.episode-workspace { min-width: 0; background: var(--white); color: var(--ink); padding: 28px; border-radius: var(--radius-lg); box-shadow: var(--shadow-soft); }
.workspace-head, .batch-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
h2 { font-size: 23px; margin: 0; }
h3 { font-size: 15px; line-height: 1.7; }
.total-chip { padding: 5px 11px; border-radius: 999px; font-size: 12px; background: var(--blue-soft); color: var(--blue-dark); white-space: nowrap; }
.config-section { margin-top: 24px; }
fieldset { border: 0; padding: 0; margin: 0; display: grid; gap: 18px; min-width: 0; }
label { font-size: 12px; color: var(--muted); }
fieldset label { min-width: 0; display: grid; gap: 8px; }
.form-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; }
textarea, input[type=number] { width: 100%; min-width: 0; background: var(--paper); color: var(--ink); border: 0; padding: 12px; border-radius: 14px; font: inherit; font-size: 14px; }
textarea { resize: vertical; }
input:focus-visible, textarea:focus-visible { outline: 2px solid var(--blue-dark); outline-offset: 2px; }
fieldset small { line-height: 1.8; font-size: 11px; color: var(--muted); }
input[type=checkbox] { accent-color: var(--blue-dark); width: 16px; height: 16px; flex-shrink: 0; }
.selection-section { margin-top: 28px; padding-top: 24px; border-top: 1px solid var(--line); }
.quick-selection { background: transparent; }
.quick-selection legend { padding: 0; margin-bottom: 16px; }
.selection-field-title { color: var(--muted); font-size: 13px; font-weight: 500; line-height: 1.6; }
.quick-range { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr) auto; align-items: end; gap: 12px; }
.quick-pending { display: flex; align-items: end; flex-wrap: wrap; gap: 12px; }
.quick-pending label { flex: 1; min-width: 150px; }
.quick-selection p { color: var(--muted); font-size: 12px; line-height: 1.8; }
.selection-toolbar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin: 20px 0 14px; }
.selection-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.selection-actions > span { font-size: 12px; color: var(--muted); }
.filter-label { display: flex; align-items: center; gap: 8px; min-width: 0; }
.chapter-list { max-height: 560px; overflow: auto; border: 0; border-radius: 16px; }
.chapter-group + .chapter-group { border-top: 1px solid var(--line); }
.chapter-group > header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; background: var(--paper); }
.chapter-group > header h3 { flex: 1; min-width: 0; }
.chapter-toggle { display: flex; align-items: center; justify-content: flex-start; flex-wrap: wrap; gap: 6px 10px; width: 100%; min-height: 36px; padding: 4px 0; background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
.chapter-toggle > span:nth-child(2) { min-width: 0; overflow-wrap: anywhere; }
.chapter-caret { display: inline-block; flex: none; color: var(--muted); transition: transform .18s ease; }
.chapter-caret.expanded { transform: rotate(90deg); }
.chapter-toggle small { color: var(--muted); font-size: 11px; font-weight: 400; line-height: 1.8; }
.episode-row { display: flex; align-items: center; gap: 10px; padding: 2px 12px; border-top: 1px solid var(--line); }
.episode-selection { display: flex; align-items: center; flex: 1; min-width: 0; gap: 10px; min-height: 44px; cursor: pointer; }
.episode-row.selected { background: var(--blue-soft); }
.episode-number { font-size: 12px; min-width: 24px; font-variant-numeric: tabular-nums; }
.episode-title { flex: 1; min-width: 0; color: var(--ink); font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
.episode-title small { display: block; font-size: 11px; color: var(--muted); }
.translation-icon-link { display: inline-grid; place-items: center; flex: 0 0 32px; width: 32px; height: 44px; border-radius: 10px; color: var(--blue-dark); }
.translation-icon-link:hover { background: var(--blue-soft); }
.translation-icon-link:focus-visible { outline: 2px solid var(--blue-dark); outline-offset: 2px; }
.translation-icon { display: block; width: 17px; height: 17px; background: currentColor; -webkit-mask: url('/icons/translate.svg') center / contain no-repeat; mask: url('/icons/translate.svg') center / contain no-repeat; }
.submit-row { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 24px; }
.hint { font-size: 12px; line-height: 1.8; color: var(--muted); flex: 1; min-width: 180px; }
.notice { padding: 14px; background: var(--blue-soft); border-radius: 14px; margin-top: 18px; font-size: 13px; line-height: 1.8; }
.empty { padding: 28px; font-size: 13px; color: var(--muted); text-align: center; }
.batch-summary { border: 0; background: transparent; padding: 24px 0 0; border-top: 1px solid var(--line); margin-top: 28px; }
progress { width: 100%; height: 8px; margin: 18px 0 12px; accent-color: var(--blue-dark); }
.batch-counts { display: flex; flex-wrap: wrap; gap: 10px 18px; font-size: 12px; color: var(--muted); }
.failures, .updates-section ul { padding-left: 18px; font-size: 12px; line-height: 1.9; margin-top: 12px; }
.updates-section { margin-top: 28px; padding-top: 24px; border-top: 1px solid var(--line); }
.updates-section details { margin-top: 12px; padding: 12px 0; border: 0; background: transparent; }
summary { cursor: pointer; font-size: 13px; line-height: 1.8; }
.warning { color: var(--blue-dark); }
@media(max-width:720px) {
  .episode-workspace { padding: 22px 16px; }
  .form-grid { grid-template-columns: 1fr; }
  textarea,input[type=number] { font-size: 16px; }
  .episode-row { gap: 8px; }
  .episode-selection { gap: 8px; }
  .submit-row > button { width: 100%; }
}
@media(max-width:580px) {
  .quick-range { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .quick-range > button { grid-column: 1 / -1; }
}
</style>
