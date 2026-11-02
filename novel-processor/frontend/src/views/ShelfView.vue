<script setup lang="ts">
import DeleteIconButton from '@/components/DeleteIconButton.vue'
import CompactButton from '@/components/CompactButton.vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { LibraryEntry, LibraryFacets, NovelSort, ProgressFilter } from '@/api'
import { api } from '@/api'
import type { ReadingProgressFilter } from '@shared/reading'
import FilterChips from '@/components/FilterChips.vue'
import ImportPanel from '@/components/ImportPanel.vue'
import NovelCard from '@/components/NovelCard.vue'
import type { SelectOption } from '@/components/select-option'
import { useSites } from '@/stores/sites'
import { notify } from '@/stores/toast'

const router = useRouter()
const { sites, load: loadSites } = useSites()

const items = ref<LibraryEntry[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(true)
const importBusy = ref(false)
const facets = ref<LibraryFacets | null>(null)

const q = ref('')
const status = ref('')
const genre = ref('')
const site = ref('')
const tag = ref('')
const progress = ref('')
const readingProgress = ref('')
const sort = ref<NovelSort>('recent')
const activeSite = ref('')
function savedExpansion(key: string): boolean { try { return localStorage.getItem(key) !== 'false' } catch { return true } }
const filtersOpen = ref(savedExpansion('novel-processor.filters-open'))
const tagsOpen = ref(savedExpansion('novel-processor.tags-open'))
watch(filtersOpen, (value) => { try { localStorage.setItem('novel-processor.filters-open', String(value)) } catch { /* Optional preference. */ } })
watch(tagsOpen, (value) => { try { localStorage.setItem('novel-processor.tags-open', String(value)) } catch { /* Optional preference. */ } })
const filterCount = computed(() => [status.value, genre.value, site.value, tag.value, progress.value, readingProgress.value].filter(Boolean).length)

const sortOptions: SelectOption[] = [
  { value: 'recent', label: '最近更新' },
  { value: 'imported', label: '最近导入' },
  { value: 'title', label: '按标题' },
  { value: 'progress', label: '按下载进度' },
]

const progressOptions = computed(() => [
  { value: 'none', label: '未下载', count: 0 },
  { value: 'partial', label: '部分下载', count: 0 },
  { value: 'complete', label: '全部下载', count: 0 },
])

const readingProgressOptions = [
  { value: 'unread', label: '未读', count: 0 },
  { value: 'reading', label: '在读', count: 0 },
  { value: 'read', label: '已读完', count: 0 },
]

const siteOptions = computed(() =>
  (facets.value?.site ?? []).map((bucket) => ({
    ...bucket,
    label: sites.value.find((s) => s.id === bucket.value)?.name ?? bucket.value,
  })),
)

const hasFilter = computed(
  () =>
    Boolean(q.value.trim()) ||
    Boolean(status.value) ||
    Boolean(genre.value) ||
    Boolean(site.value) ||
    Boolean(tag.value) ||
    Boolean(progress.value) ||
    Boolean(readingProgress.value),
)

const summary = computed(() => {
  const all = facets.value?.total ?? 0
  if (!hasFilter.value) return `共 ${all} 部作品`
  return `筛选出 ${total.value} 部 / 共 ${all} 部`
})

let searchTimer: ReturnType<typeof setTimeout> | undefined

async function loadFacets(): Promise<void> {
  try {
    facets.value = await api.facets()
  } catch {
    facets.value = null
  }
}

async function loadList(append = false): Promise<void> {
  loading.value = true
  try {
    const result = await api.library({
      q: q.value.trim() || undefined,
      status: status.value || undefined,
      genre: genre.value || undefined,
      site: site.value || undefined,
      tag: tag.value || undefined,
      progress: progress.value ? progress.value as ProgressFilter : undefined,
      readingProgress: readingProgress.value ? readingProgress.value as ReadingProgressFilter : undefined,
      sort: sort.value,
      page: page.value,
      limit: 48,
    })
    items.value = append ? [...items.value, ...result.items] : result.items
    total.value = result.total
  } catch (err) {
    notify(err instanceof Error ? err.message : '读取书库失败', 'error')
  } finally {
    loading.value = false
  }
}

function resetAndLoad(): void {
  page.value = 1
  void loadList()
}

function loadMore(): void {
  page.value += 1
  void loadList(true)
}

function clearFilters(): void {
  q.value = ''
  status.value = ''
  genre.value = ''
  site.value = ''
  tag.value = ''
  progress.value = ''
  readingProgress.value = ''
}

async function handleImport(payload: { input: string; site: string }): Promise<void> {
  importBusy.value = true
  try {
    const record = await api.importNovel(payload.input, payload.site)
    clearFilters()
    await Promise.all([loadFacets(), loadList()])
    notify(`已导入「${record.meta.title}」，共 ${record.episodes.length} 话`)
  } catch (err) {
    notify(err instanceof Error ? err.message : '导入失败', 'error')
  } finally {
    importBusy.value = false
  }
}

async function handleSync(): Promise<void> {
  try {
    const result = await api.sync()
    await Promise.all([loadFacets(), loadList()])
    notify(`索引已重建：${result.novels} 部作品 / ${result.episodes} 话`)
  } catch (err) {
    notify(err instanceof Error ? err.message : '重建索引失败', 'error')
  }
}

function openNovel(entry: LibraryEntry): void {
  void router.push({ name: 'novel', params: { site: entry.site, novelId: entry.novelId } })
}

watch(q, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(resetAndLoad, 220)
})

watch([status, genre, site, tag, progress, readingProgress, sort], resetAndLoad)

onMounted(async () => {
  const list = await loadSites()
  activeSite.value = list[0]?.id ?? ''
  await Promise.all([loadFacets(), loadList()])
})

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
})
</script>

<template>
  <main class="shelf section-wrap">
    <ImportPanel v-model="activeSite" :sites="sites" :busy="importBusy" @submit="handleImport" />

    <div class="shelf-head">
      <div class="head-left">
        <h1>书架</h1>
        <span class="summary">{{ summary }}</span>
      </div>
      <div class="head-right">
        <DeleteIconButton to="/trash" :label="`回收站${facets && facets.trashed > 0 ? `（${facets.trashed} 部作品）` : ''}`" />
        <CompactButton variant="secondary" @click="handleSync">
          重建索引
          <template #icon><span class="reindex-icon" /></template>
        </CompactButton>
      </div>
    </div>

    <div class="toolbar">
      <div class="search-shell">
        <span class="search-icon" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
            <circle cx="7" cy="7" r="4.4" />
            <path d="m10.4 10.4 3 3" />
          </svg>
        </span>
        <input v-model="q" type="search" placeholder="搜索标题或作者" aria-label="搜索书库" spellcheck="false" />
      </div>
      <AppSelect v-model="sort" label="排序" :options="sortOptions" />
    </div>

    <section v-if="facets" class="filters" :class="{ 'filters--collapsed': !filtersOpen }">
      <div class="filter-heading"><button class="filter-toggle" type="button" :aria-expanded="filtersOpen" aria-controls="shelf-filter-content" @click="filtersOpen = !filtersOpen">筛选<span v-if="filterCount"> · {{ filterCount }} 项生效</span><span class="filter-chevron" :class="{ 'filter-chevron--up': filtersOpen }" aria-hidden="true" /></button><button v-if="filterCount" class="filter-clear" type="button" @click="clearFilters">清空筛选</button></div>
      <div v-show="filtersOpen" id="shelf-filter-content">
      <FilterChips v-model="status" label="状态" :options="facets.status" />
      <FilterChips v-model="progress" label="下载进度" :options="progressOptions" />
      <FilterChips v-model="readingProgress" label="阅读进度" :options="readingProgressOptions" />
      <FilterChips v-model="genre" label="题材" :options="facets.genre" />
      <FilterChips v-if="siteOptions.length > 1" v-model="site" label="站点" :options="siteOptions" />
      <FilterChips v-if="facets.tags.length" v-model="tag" v-model:expanded="tagsOpen" collapsible label="标签" :options="facets.tags" />
      </div>
    </section>

    <div v-if="loading && items.length === 0" class="state">
      <span class="loading-bar" />
      <p class="muted">读取书库…</p>
    </div>

    <div v-else-if="items.length === 0" class="state">
      <p class="state-title">{{ hasFilter ? '没有匹配的作品' : '书架是空的' }}</p>
      <p class="muted">{{ hasFilter ? '试试放宽筛选条件。' : '在上方粘贴作品地址导入第一本。' }}</p>
      <button v-if="hasFilter" class="pill pill--ghost pill--small" type="button" @click="clearFilters">
        <span>清空筛选</span>
      </button>
    </div>

    <template v-else>
      <div class="grid">
        <NovelCard v-for="entry in items" :key="`${entry.site}/${entry.novelId}`" :entry="entry" @open="openNovel" />
      </div>

      <div v-if="items.length < total" class="more">
        <button class="pill pill--ghost" type="button" :disabled="loading" @click="loadMore">
          <span>{{ loading ? '加载中…' : `加载更多（${items.length}/${total}）` }}</span>
          <span class="pill__arrow" aria-hidden="true">↓</span>
        </button>
      </div>
    </template>
  </main>
</template>

<style scoped>
.filter-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.filter-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  min-width: 0;
  min-height: 44px;
  padding: 8px 0;
  background: none;
  color: var(--ink);
  font-size: 12px;
  cursor: pointer;
}
.filter-heading > .filter-toggle { flex: 1; font-size: 15px; font-weight: 600; }
.filter-heading > .filter-toggle .filter-chevron { margin-left: auto; }
.filter-chevron {
  display: block;
  flex: none;
  width: 12px;
  height: 12px;
  background: var(--blue-dark);
  -webkit-mask: url('/icons/chevron.down.svg') center / contain no-repeat;
  mask: url('/icons/chevron.down.svg') center / contain no-repeat;
}
.filter-chevron--up {
  -webkit-mask-image: url('/icons/chevron.up.svg');
  mask-image: url('/icons/chevron.up.svg');
}
.filter-clear { min-height: 44px; padding: 8px 0 8px 12px; background: none; color: var(--blue-dark); font-size: 12px; cursor: pointer; }
.filters.filters--collapsed { height: var(--shelf-control-height); padding-block: 0; border-radius: 999px; }
.filters--collapsed .filter-heading { height: 100%; }
.filters--collapsed .filter-heading > button { height: 100%; min-height: 0; padding-block: 0; }

.shelf {
  --shelf-control-height: 44px;
  flex: 1;
  padding-bottom: 56px;
}

.shelf-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-top: 34px;
}

.head-left {
  display: flex;
  align-items: baseline;
  gap: 14px;
}

.head-left h1 {
  font-size: 30px;
  letter-spacing: -0.05em;
}

.summary {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--faint);
}

.head-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.reindex-icon {
  background: currentColor;
  -webkit-mask: url('/icons/square.split.bottomrightquarter.fill.svg') center / contain no-repeat;
  mask: url('/icons/square.split.bottomrightquarter.fill.svg') center / contain no-repeat;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
}

.search-shell {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  height: var(--shelf-control-height);
  padding: 0 18px;
  border-radius: 999px;
  background: var(--white);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.search-shell:focus-within {
  box-shadow: 0 10px 26px rgb(49 83 105 / 9%);
}

.search-icon {
  display: grid;
  place-items: center;
  width: 15px;
  height: 15px;
  color: var(--faint);
  flex: none;
}

.search-icon svg {
  width: 15px;
  height: 15px;
}

.search-shell input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--ink);
}

.search-shell input::placeholder {
  color: #a9b6bd;
}

.filters {
  margin-top: 14px;
  padding: 6px 16px;
  border-radius: var(--radius-lg);
  background: var(--surface-muted);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(248px, 1fr));
  gap: 14px;
  margin-top: 18px;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 78px 20px;
  margin-top: 18px;
  border-radius: var(--radius-lg);
  text-align: center;
}

.state-title {
  font-family: var(--display);
  font-size: 17px;
  font-weight: 600;
  color: var(--ink);
}

.state p.muted {
  font-size: 12.5px;
  line-height: 1.8;
}

.loading-bar {
  display: block;
  height: 3px;
  width: 64px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, var(--blue), transparent);
  animation: sweep 1.4s ease-in-out infinite;
}

@keyframes sweep {
  0%, 100% { opacity: 0.25; transform: scaleX(0.6); }
  50% { opacity: 1; transform: scaleX(1); }
}

.more {
  display: flex;
  justify-content: center;
  margin-top: 26px;
}

@media (max-width: 720px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .grid {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }
}
@media (max-width: 720px) {
  .shelf { --shelf-control-height: 52px; padding-bottom: 36px; }
  .shelf-head { flex-wrap: wrap; align-items: center; gap: 2px 14px; margin-top: 24px; }
  .head-left { flex-wrap: wrap; gap: 2px 9px; }
  .head-left h1 { font-size: 25px; line-height: 1.1; }
  .summary { font-size: 10px; }
  .head-right { gap: 10px; }
  .toolbar { margin-top: 10px; }
  .search-shell { height: var(--shelf-control-height); padding-inline: 18px; }
  .search-shell input { font-size: 16px; }
  .search-icon, .search-icon svg { width: 20px; height: 20px; }
  .filters { margin-top: 12px; padding: 5px 12px; border-radius: 24px; }
  .grid { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .state { padding: 48px 16px; }
}
</style>
