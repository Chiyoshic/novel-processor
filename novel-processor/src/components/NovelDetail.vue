<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Episode, NovelRecord } from '@/lib'

const props = defineProps<{
  catalog: NovelRecord
  downloaded: Set<number>
  busy: string | null
}>()

const emit = defineEmits<{
  open: [index: number]
  download: [payload: { range?: string; all?: boolean; overwrite?: boolean }]
}>()

const rangeInput = ref('')
const concurrency = defineModel<number>('concurrency', { default: 4 })
const collapsed = ref<Set<string>>(new Set())

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
        <h2 class="detail-title">{{ catalog.meta.title }}</h2>
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
          <span>{{ busy ? '下载中…' : '全部重抓' }}</span>
          <span class="pill__arrow" aria-hidden="true">↗</span>
        </button>
      </div>
    </div>

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
        <button class="group-head" type="button" @click="toggle(group.key)">
          <span class="group-caret" :class="{ open: !isCollapsed(group.key) }" aria-hidden="true">▸</span>
          <span class="group-title">{{ group.title }}</span>
          <span class="group-count">{{ group.done }}/{{ group.episodes.length }}</span>
        </button>

        <ul v-show="!isCollapsed(group.key)" class="episodes">
          <li v-for="episode in group.episodes" :key="episode.index">
            <button
              class="episode"
              :class="{ done: downloaded.has(episode.index) }"
              type="button"
              @click="emit('open', episode.index)"
            >
              <span class="ep-index">{{ String(episode.index).padStart(3, '0') }}</span>
              <span class="ep-title">{{ episode.title }}</span>
              <span class="ep-date">{{ formatDate(episode.publishedAt) }}</span>
              <span class="ep-state" :class="{ on: downloaded.has(episode.index) }">
                {{ downloaded.has(episode.index) ? '已存' : '未存' }}
              </span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.detail {
  min-width: 0;
  padding: 26px 28px 22px;
  border: 1px solid var(--line);
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

.detail-title {
  margin-top: 12px;
  font-size: clamp(24px, 2.4vw, 34px);
  line-height: 1.12;
  letter-spacing: -0.055em;
  max-width: 620px;
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
  border-bottom: 1px solid rgb(63 113 156 / 30%);
  padding-bottom: 2px;
  transition: border-color 0.2s ease;
}

.source-link:hover {
  border-color: var(--blue-dark);
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin-top: 24px;
  padding: 18px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.stat {
  padding: 0 20px;
  border-left: 1px solid var(--line);
}

.stat:first-child {
  padding-left: 0;
  border-left: 0;
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
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--paper);
  font-size: 12px;
  outline: none;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.range-field input:focus {
  background: var(--white);
  border-color: rgb(106 158 205 / 55%);
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
  border: 1px solid var(--line);
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
  border-bottom: 1px solid var(--line);
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
  grid-template-columns: 42px minmax(0, 1fr) 84px 42px;
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

.ep-state {
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.06em;
  text-align: right;
  color: #b9c6cd;
}

.ep-state.on {
  color: #4f8d7b;
}

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
    border-left: 0;
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
    grid-template-columns: 38px minmax(0, 1fr) 40px;
  }
  .ep-date {
    display: none;
  }
}
</style>
