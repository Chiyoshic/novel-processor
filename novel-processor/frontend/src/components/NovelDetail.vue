<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Episode, NovelRecord } from '@/lib'
import type { DownloadJob } from '@/api'
import type { EpisodeTranslationStatus } from '@shared/episode-translation'
import ReadingStatusBar from './ReadingStatusBar.vue'
import ReadingStateControl from './ReadingStateControl.vue'
import { aggregateReadingState, type ReadingProgress, type ReadingState, type UpdateReading } from '@shared/reading'
import { detectLang } from '@/utils/lang'

const props = defineProps<{
  catalog: NovelRecord
  downloaded: Set<number>
  translations?: EpisodeTranslationStatus[]
  reading?: ReadingProgress | null
  readingSaving?: boolean
  busy: string | null
  job: DownloadJob | null
}>()

const emit = defineEmits<{
  'update-reading': [input: UpdateReading]
  open: [index: number]
  download: [payload: { range?: string; all?: boolean; overwrite?: boolean }]
}>()

const readingByIndex = computed(() => new Map((props.reading?.episodes ?? []).map((item) => [item.index, item.status])))
function rangeReadingState(episodes: Episode[]): ReadingState {
  return aggregateReadingState(episodes.map((episode) => readingByIndex.value.get(episode.index) ?? 'unread'))
}
function setChapterReading(status: ReadingState, key: string): void {
  emit('update-reading', key === 'all' ? { scope: 'book', status } : { scope: 'chapter', chapterIndex: key === 'loose' ? null : Number(key.slice(1)), status })
}
const translationStates = computed(() => new Map((props.translations ?? []).map((item) => [item.index, item])))
const translatedCount = computed(() => (props.translations ?? []).filter((item) => item.hasTranslation && item.status !== 'stale').length)
const rangeInput = ref('')
const concurrency = defineModel<number>('concurrency', { default: 4 })
const collapsed = ref<Set<string>>(new Set())
/** 作品简介（あらすじ）默认折叠，长简介不必占满首屏 */
const summaryOpen = ref(false)

const summary = computed(() => props.catalog.meta.summary.trim())
/**
 * なろう 的简介用空行分段，且每段自带全角缩进。
 * 直接 pre-wrap 渲染会让空行占满整行高度、整块显得很散；
 * 折叠成单换行既保留分段，又紧凑得多。
 */
const summaryDisplay = computed(() => summary.value.replace(/\n{2,}/g, '\n'))
const summaryIsLong = computed(
  () => summaryDisplay.value.length > 140 || summaryDisplay.value.split('\n').length > 4,
)
/** 内容语言：决定标题与正文用日文还是中文衬线字形 */
const lang = computed(() => detectLang(props.catalog.meta.title, props.catalog.meta.summary))

interface Group {
  key: string
  title: string
  episodes: Episode[]
  done: number
}

const groups = computed<Group[]>(() => {
  const { chapters, episodes } = props.catalog
  if (chapters.length === 0) {
    return [{ key: 'all', title: '全部话', episodes, done: episodes.filter((e) => props.downloaded.has(e.index)).length }]
  }
  const list: Group[] = chapters.map((chapter) => {
    const items = episodes.filter((e) => e.chapterIndex === chapter.index)
    return {
      key: `c${chapter.index}`,
      title: chapter.title,
      episodes: items,
      done: items.filter((e) => props.downloaded.has(e.index)).length,
    }
  })
  const loose = episodes.filter((e) => e.chapterIndex === null)
  if (loose.length > 0) {
    list.unshift({
      key: 'loose',
      title: '未分章',
      episodes: loose,
      done: loose.filter((e) => props.downloaded.has(e.index)).length,
    })
  }
  return list
})

const total = computed(() => props.catalog.episodes.length)
const have = computed(() => props.downloaded.size)
const percent = computed(() => (total.value === 0 ? 0 : Math.round((have.value / total.value) * 100)))
const missing = computed(() => total.value - have.value)

/** 当前下载任务（内存态），仅 running 时展示 */
const fetchingIndices = computed(() => new Set(props.job?.running ? props.job.activeIndices ?? [] : []))
function downloadState(index: number): 'fetching' | 'stored' | 'missing' {
  return fetchingIndices.value.has(index) ? 'fetching' : props.downloaded.has(index) ? 'stored' : 'missing'
}
const downloadStateLabels = { fetching: '正在抓取', stored: '已存', missing: '未存' }
const running = computed(() => props.job?.running === true)
const jobDone = computed(() => props.job?.done ?? 0)
const jobTotal = computed(() => props.job?.total ?? 0)
const jobFailed = computed(() => props.job?.failed ?? 0)
const jobPercent = computed(() =>
  jobTotal.value === 0 ? 0 : Math.round((jobDone.value / jobTotal.value) * 100),
)

const statusLabel = computed(() => {
  const map: Record<string, string> = {
    ongoing: '连载中',
    completed: '完结',
    hiatus: '休载',
    short: '短篇',
    unknown: '未知',
  }
  return props.catalog.meta.statusLabel ?? map[props.catalog.meta.status] ?? '未知'
})

const stats = computed(() => [
  { label: 'Episodes', value: formatNumber(props.catalog.meta.episodeCount ?? total.value) },
  { label: 'Chapters', value: formatNumber(props.catalog.meta.chapterCount ?? groups.value.length) },
  { label: 'Words', value: props.catalog.meta.wordCount ? formatNumber(props.catalog.meta.wordCount) : '—' },
  { label: 'Downloaded', value: `${have.value}` },
  { label: 'Translated', value: `${translatedCount.value}` },
])

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[1]}/${m[2]}/${m[3]}` : '—'
}

function toggle(key: string): void {
  const next = new Set(collapsed.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsed.value = next
}

function isCollapsed(key: string): boolean {
  return collapsed.value.has(key)
}

function expandAll(): void {
  collapsed.value = new Set()
}

function collapseAll(): void {
  collapsed.value = new Set(groups.value.map((group) => group.key))
}

function submitRange(): void {
  const range = rangeInput.value.trim()
  if (!range) return
  emit('download', { range })
}

// 切换作品时重置折叠状态：只展开第一章
watch(
  () => props.catalog.source.novelId,
  () => {
    collapsed.value = new Set(groups.value.slice(1).map((group) => group.key))
    rangeInput.value = ''
    summaryOpen.value = false
  },
  { immediate: true },
)
</script>

<template>
  <section class="detail">
    <div class="detail-head">
      <div class="head-main">
        <p class="eyebrow">
          {{ catalog.source.siteName }} / {{ catalog.source.novelId }}
        </p>
        <h2 class="detail-title serif" :lang="lang">{{ catalog.meta.title }}</h2>
        <div class="head-meta">
          <span class="author">{{ catalog.meta.author.name || '未知作者' }}</span>
          <span class="sep" aria-hidden="true">·</span>
          <span class="chip chip--accent">{{ statusLabel }}</span>
          <span v-if="catalog.meta.completedAt" class="chip">完结 {{ catalog.meta.completedAt }}</span>
          <span class="chip">首发 {{ formatDate(catalog.meta.firstPublishedAt) }}</span>
        </div>
      </div>
      <a class="source-link" :href="catalog.source.url" target="_blank" rel="noreferrer">
        原站 <span aria-hidden="true">↗</span>
      </a>
    </div>

    <div v-if="summary" class="summary-block">
      <p class="eyebrow eyebrow--faint">あらすじ</p>
      <p class="summary-text serif" :class="{ clamped: summaryIsLong && !summaryOpen }" :lang="lang">
        {{ summaryDisplay }}
      </p>
      <button v-if="summaryIsLong" class="summary-toggle" type="button" @click="summaryOpen = !summaryOpen">
        {{ summaryOpen ? '收起' : '展开全文' }}
      </button>
    </div>

    <div class="stat-row">
      <div v-for="stat in stats" :key="stat.label" class="stat">
        <span class="eyebrow eyebrow--faint">{{ stat.label }}</span>
        <strong>{{ stat.value }}</strong>
      </div>
    </div>

    <div class="progress-block">
      <div class="progress-head">
        <span class="eyebrow eyebrow--faint">Local</span>
        <span class="progress-text">
          已下载 <strong>{{ have }}</strong> / {{ total }} 话
          <template v-if="missing > 0"> · 缺 {{ missing }} 话</template>
          <template v-else> · 完整</template>
        </span>
      </div>
      <div class="progress-track">
        <span class="progress-fill" :style="{ width: `${percent}%` }" />
      </div>

      <div v-if="running" class="job-line">
        <span class="job-dot" aria-hidden="true" />
        <span class="job-text">
          本次任务 <strong>{{ jobDone }}</strong> / {{ jobTotal }} 话
          <template v-if="jobFailed > 0"> · 失败 {{ jobFailed }}</template>
        </span>
        <span class="job-percent">{{ jobPercent }}%</span>
      </div>
    </div>

    <div class="toolbar">
      <div class="range-field">
        <input
          v-model="rangeInput"
          type="text"
          placeholder="区间，如 1-20,25"
          aria-label="下载区间"
          @keydown.enter="submitRange"
        />
        <button class="pill pill--ghost pill--small" type="button" :disabled="!rangeInput.trim() || !!busy" @click="submitRange">
          抓区间
        </button>
      </div>

      <div class="toolbar-actions">
        <label class="concurrency">
          <span class="eyebrow eyebrow--faint">Conc.</span>
          <select v-model.number="concurrency" :disabled="!!busy">
            <option :value="1">1</option>
            <option :value="2">2</option>
            <option :value="4">4</option>
            <option :value="6">6</option>
            <option :value="8">8</option>
          </select>
        </label>
        <button class="pill pill--ghost pill--small" type="button" :disabled="!!busy || missing === 0" @click="emit('download', {})">
          <span>补缺失</span>
        </button>
        <button class="pill" type="button" :disabled="!!busy" @click="emit('download', { all: true, overwrite: true })">
          <span>{{ running ? `下载中 ${jobDone}/${jobTotal}` : busy ? '下载中…' : '全部重抓' }}</span>
          <span class="download-all-icon" aria-hidden="true" />
        </button>
      </div>
    </div>

    <section class="reading-management" aria-label="阅读进度管理">
      <ReadingStatusBar v-if="reading" :progress="reading" />
      <div class="book-reading-actions"><span>全书阅读状态</span><ReadingStateControl :status="rangeReadingState(catalog.episodes)" label="全书" :count="catalog.episodes.length" :disabled="readingSaving" @change="emit('update-reading', { scope: 'book', status: $event })" /></div>
    </section>
    <div class="list-head">
      <span class="eyebrow eyebrow--faint">Contents</span>
      <div class="list-tools">
        <button type="button" class="text-btn" @click="expandAll">展开全部</button>
        <span class="sep">·</span>
        <button type="button" class="text-btn" @click="collapseAll">折叠全部</button>
      </div>
    </div>

    <div class="episode-list">
      <div v-for="group in groups" :key="group.key" class="group">
        <div class="group-heading"><button class="group-head" type="button" @click="toggle(group.key)">
          <span class="group-caret" :class="{ open: !isCollapsed(group.key) }" aria-hidden="true">▸</span>
          <span class="group-title serif" :lang="lang">{{ group.title }}</span>
          <span class="group-count">已读 {{ group.episodes.filter((episode) => readingByIndex.get(episode.index) === 'read').length }}/{{ group.episodes.length }} · 已存 {{ group.done }}</span>
        </button><div class="episode-status-actions"><ReadingStateControl compact :status="rangeReadingState(group.episodes)" :label="group.title" :count="group.episodes.length" :disabled="readingSaving" @change="setChapterReading($event, group.key)" /></div></div>

        <ul v-show="!isCollapsed(group.key)" class="episodes">
          <li v-for="episode in group.episodes" :key="episode.index" class="episode-item">
            <button
              class="episode"
              :class="{ done: downloaded.has(episode.index) }"
              type="button"
              @click="emit('open', episode.index)"
            >
              <span class="ep-index">{{ String(episode.index).padStart(3, '0') }}</span>
              <span class="ep-title serif" :lang="lang">{{ episode.title }}<span v-if="translationStates.get(episode.index)?.hasTranslation" class="translation-state translated" role="img" aria-label="已翻译" title="已翻译"><span class="translation-icon" aria-hidden="true" /></span></span>
              <span class="ep-date">{{ formatDate(episode.publishedAt) }}</span>
            </button>
            <div class="episode-status-actions">
            <button v-if="downloadState(episode.index) === 'missing'" class="ep-state ep-state--missing ep-download-button" type="button" :disabled="!!busy || running" :aria-label="`下载第 ${episode.index} 话`" :title="`未存，点击下载第 ${episode.index} 话`" @click.stop="emit('download', { range: String(episode.index) })"><span class="ep-download-icon" aria-hidden="true" /></button>
            <span v-else class="ep-state" :class="`ep-state--${downloadState(episode.index)}`" role="img" :aria-label="downloadStateLabels[downloadState(episode.index)]" :title="downloadStateLabels[downloadState(episode.index)]"><span class="ep-download-icon" aria-hidden="true" /></span>
            <ReadingStateControl compact :status="readingByIndex.get(episode.index) ?? 'unread'" :label="`第 ${episode.index} 话 · ${episode.title}`" :disabled="readingSaving" @change="emit('update-reading', { scope: 'episode', index: episode.index, status: $event })" />
            </div>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.download-all-icon {
  display: block;
  flex: none;
  width: 26px;
  height: 26px;
  background: currentColor;
  -webkit-mask: url('/icons/arrow.down.circle.fill.svg') center / contain no-repeat;
  mask: url('/icons/arrow.down.circle.fill.svg') center / contain no-repeat;
}

.reading-management { margin-top: 22px; padding-top: 6px; border-top: 1px solid var(--line); }
.book-reading-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 16px; color: var(--muted); font-size: 12px; }
/* 章标题和每话使用相同的固定双图标列，阅读状态始终在最右侧同一轴线上。 */
.group-heading, .episode-item { display: grid; grid-template-columns: minmax(0, 1fr) 64px; align-items: center; gap: 8px; }
.group-heading .group-head, .episode-item .episode { min-width: 0; width: 100%; }
.episode-status-actions { display: flex; align-items: center; justify-content: flex-end; width: 64px; gap: 0; }.episode-status-actions .ep-state { width: 32px; }
@media(max-width:580px) { .group-heading { gap: 4px; }.episode-item { gap: 4px; }.group-count { white-space: normal; } }

.detail {
  min-width: 0;
  padding: 26px 28px 22px;
  border-radius: var(--radius-lg);
  background: var(--white);
  box-shadow: var(--shadow-soft);
}

.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

/* 标题尽量占满可用宽度：放得下就单行，放不下才自然折行 */
.head-main {
  flex: 1;
  min-width: 0;
}

.detail-title {
  margin-top: 12px;
  font-size: clamp(24px, 2.4vw, 34px);
  font-weight: 700;
  line-height: 1.2;
  /* 中文/日文标题用负字距会挤字，这里保持 0 */
  letter-spacing: 0;
  text-wrap: balance;
}

.head-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 14px;
  font-size: 12px;
}

.author {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}

.sep {
  color: #c3d0d6;
}

.source-link {
  flex: none;
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--blue-dark);
  padding-bottom: 2px;
  transition: border-color 0.2s ease;
}

.summary-block {
  margin-top: 16px;
  padding: 11px 14px 10px;
  border-radius: 12px;
  background: var(--paper);
}

.summary-text {
  margin-top: 5px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.8;
  color: #55656f;
  letter-spacing: 0;
}

.summary-text.clamped {
  max-height: 5.4em;
  overflow: hidden;
  mask-image: linear-gradient(#000 72%, transparent 100%);
}

.summary-toggle {
  margin-top: 6px;
  border: 0;
  background: none;
  padding: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--blue-dark);
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin-top: 24px;
  padding: 18px 0;
}

.stat {
  padding: 0 20px;
}

.stat:first-child {
  padding-left: 0;
}

.stat strong {
  display: block;
  margin-top: 8px;
  font-family: var(--display);
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.05em;
  line-height: 1.1;
}

.progress-block {
  margin-top: 20px;
}

.progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.progress-text {
  font-size: 12px;
  color: var(--muted);
}

.progress-text strong {
  color: var(--ink);
  font-weight: 700;
}

.progress-track {
  height: 5px;
  margin-top: 9px;
  border-radius: 999px;
  background: #e8f0f4;
  overflow: hidden;
}

.progress-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--blue), var(--blue-dark));
  transition: width 0.5s ease;
}

.job-line {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 12px;
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--blue-soft);
  font-family: var(--mono);
  font-size: 11px;
  color: var(--blue-dark);
}

.job-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--blue);
  flex: none;
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.35; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1); }
}

.job-text strong {
  font-weight: 700;
  color: var(--ink);
}

.job-percent {
  margin-left: auto;
  font-weight: 700;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 20px;
}

.range-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.range-field input {
  width: 168px;
  padding: 9px 14px;
  border-radius: 999px;
  background: var(--paper);
  font-size: 12px;
  outline: none;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.range-field input:focus {
  background: var(--white);
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.concurrency {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px 7px 13px;
  border-radius: 999px;
  background: var(--paper);
}

.concurrency select {
  border: 0;
  background: transparent;
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--blue-dark);
  outline: none;
  cursor: pointer;
}

.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 28px;
  padding-bottom: 10px;
}

.list-tools {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
}

.text-btn {
  border: 0;
  background: none;
  padding: 0;
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
  transition: color 0.2s ease;
}

.text-btn:hover {
  color: var(--blue-dark);
}

.episode-list {
  max-height: 46vh;
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-width: thin;
  scrollbar-color: #c6d7e0 transparent;
}

.episode-list::-webkit-scrollbar {
  width: 8px;
}

.episode-list::-webkit-scrollbar-thumb {
  background: #cfdde5;
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: content-box;
}

.group + .group {
  margin-top: 4px;
}

.group-head {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 13px 4px 11px;
  border: 0;
  background: none;
  cursor: pointer;
  text-align: left;
}

.group-caret {
  font-size: 9px;
  color: var(--blue);
  transition: transform 0.2s ease;
}

.group-caret.open {
  transform: rotate(90deg);
}

.group-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--ink);
}

.group-count {
  margin-left: auto;
  font-family: var(--mono);
  font-size: 10px;
  color: var(--faint);
}

.episodes {
  list-style: none;
  margin: 0;
  padding: 0 0 6px;
}

.episode {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 84px;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.18s ease;
}

.episode:hover {
  background: var(--blue-soft);
}

.ep-index {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--faint);
  letter-spacing: 0.04em;
}

.episode.done .ep-index {
  color: var(--blue-dark);
}

.ep-title {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.episode.done .ep-title {
  color: var(--ink);
}

.ep-date {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--faint);
  text-align: right;
}

.translation-state { display: inline-flex; align-items: center; vertical-align: middle; margin-left: 8px; color: var(--blue-dark); white-space: nowrap; }
.translation-icon { display: block; width: 17px; height: 17px; background: currentColor; -webkit-mask: url('/icons/translate.svg') center / contain no-repeat; mask: url('/icons/translate.svg') center / contain no-repeat; }
.ep-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 40px;
  min-height: 44px;
  color: var(--muted);
}
.ep-download-button { padding: 0; border: 0; border-radius: 12px; background: transparent; cursor: pointer; }
.ep-download-button:hover:not(:disabled) { background: var(--blue-soft); color: var(--blue-dark); }
.ep-download-button:disabled { opacity: .45; cursor: not-allowed; }
.ep-download-icon {
  display: block;
  flex: none;
  width: 18px;
  height: 18px;
  background: currentColor;
  -webkit-mask: var(--download-state-icon) center / contain no-repeat;
  mask: var(--download-state-icon) center / contain no-repeat;
}
.ep-state--missing { --download-state-icon: url('/icons/square.and.arrow.down.badge.xmark.svg'); }
.ep-state--fetching { --download-state-icon: url('/icons/square.and.arrow.down.badge.clock.svg'); color: var(--blue-dark); }
.ep-state--stored { --download-state-icon: url('/icons/square.and.arrow.down.badge.checkmark.svg'); color: var(--success-ink); }

@media (max-width: 900px) {
  .detail {
    padding: 20px 18px;
  }
  .stat-row {
    grid-template-columns: repeat(2, 1fr);
    gap: 18px 0;
  }
  .stat:nth-child(odd) {
    padding-left: 0;
  }
  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .range-field input {
    flex: 1;
    width: auto;
  }
  .toolbar-actions {
    justify-content: space-between;
  }
  .episode {
    grid-template-columns: 38px minmax(0, 1fr);
  }
  .ep-date {
    display: none;
  }
}
@media (max-width: 580px) {
  .detail { padding: 20px 16px; }
  .detail-head { gap: 10px; }
  .detail-title { font-size: 23px; overflow-wrap: anywhere; }
  .head-meta { gap: 6px; }
  .stat-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stat { min-width: 0; padding-right: 8px; }
  .stat strong { font-size: 21px; overflow-wrap: anywhere; }
  .range-field input { min-width: 0; min-height: 42px; font-size: 14px; }
  .toolbar-actions { flex-wrap: wrap; justify-content: flex-start; }
  .concurrency { min-height: 42px; }
  .episode-list { max-height: 55vh; }
  .episode { min-height: 44px; gap: 6px; padding: 9px 4px; grid-template-columns: 30px minmax(0, 1fr); }
  .group-title { min-width: 0; overflow-wrap: anywhere; }
  .group-count { flex: none; }
  .list-tools .text-btn { min-height: 40px; }
  .summary-toggle { min-height: 40px; }
}
</style>
