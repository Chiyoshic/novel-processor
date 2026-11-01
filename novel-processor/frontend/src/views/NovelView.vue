<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { NovelRecord } from '@/lib'
import { api, type DownloadJob } from '@/api'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import NovelDetail from '@/components/NovelDetail.vue'
import type { ReadingProgress, UpdateReading } from '@shared/reading'
import type { EpisodeTranslationStatus } from '@shared/episode-translation'
import { notify } from '@/stores/toast'

const props = defineProps<{ site: string; novelId: string }>()
const router = useRouter()

const catalog = ref<NovelRecord | null>(null)
const downloaded = ref<Set<number>>(new Set())
const reading = ref<ReadingProgress | null>(null)
const readingSaving = ref(false)
const translations = ref<EpisodeTranslationStatus[]>([])
let translationPoll: ReturnType<typeof setInterval> | undefined
const busy = ref<string | null>(null)
const concurrency = ref(4)
const loading = ref(true)
const error = ref<string | null>(null)
const refreshing = ref(false)
const pendingTrash = ref(false)
const removing = ref(false)
/** 下载任务的内存进度（来自 /status 的 job 字段） */
const job = ref<DownloadJob | null>(null)

let pollTimer: ReturnType<typeof setInterval> | undefined

const entry = computed(() => catalog.value)

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const [record, progress, translated, readProgress] = await Promise.all([
      api.catalog(props.site, props.novelId),
      api.progress(props.site, props.novelId),
      api.episodeTranslations(props.site, props.novelId),
      api.readingProgress(props.site, props.novelId).catch(() => { notify('阅读状态读取失败，可刷新重试', 'error'); return null }),
    ])
    catalog.value = record
    reading.value = readProgress
    translations.value = translated.episodes
    downloaded.value = new Set(progress.indices)
    job.value = progress.job
  } catch (err) {
    error.value = err instanceof Error ? err.message : '读取作品失败'
  } finally {
    loading.value = false
  }
}

async function updateReading(input: UpdateReading): Promise<void> {
  if (readingSaving.value) return
  readingSaving.value = true
  try { reading.value = await api.updateReading(props.site, props.novelId, input) }
  catch (error) { notify(error instanceof Error ? error.message : '阅读状态保存失败', 'error') }
  finally { readingSaving.value = false }
}

async function refreshProgress(): Promise<void> {
  try {
    const progress = await api.progress(props.site, props.novelId)
    downloaded.value = new Set(progress.indices)
    job.value = progress.job
  } catch {
    // 轮询失败静默
  }
}

async function handleDownload(payload: { range?: string; all?: boolean; overwrite?: boolean }): Promise<void> {
  if (busy.value) return
  busy.value = payload.range ? `区间 ${payload.range}` : payload.all ? '全部' : '补缺失'
  // 600ms 一次：后端每话都会写索引，轮询能真实反映进度
  pollTimer = setInterval(() => void refreshProgress(), 600)
  try {
    const result = await api.download(props.site, props.novelId, {
      range: payload.range,
      all: payload.all,
      overwrite: payload.overwrite,
      concurrency: concurrency.value,
    })
    await refreshProgress()
    const failed = result.failed.length
    notify(
      failed > 0 ? `新抓 ${result.fetched} 话，${failed} 话失败` : `新抓 ${result.fetched} 话，跳过 ${result.skipped} 话`,
      failed > 0 ? 'error' : 'ok',
    )
  } catch (err) {
    notify(err instanceof Error ? err.message : '下载失败', 'error')
  } finally {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = undefined
    busy.value = null
    await refreshProgress()
  }
}

function openEpisode(index: number): void {
  void router.push({
    name: 'reader',
    params: { site: props.site, novelId: props.novelId, index: String(index) },
  })
}

async function handleRefresh(): Promise<void> {
  if (refreshing.value) return
  refreshing.value = true
  try {
    const record = await api.refresh(props.site, props.novelId)
    catalog.value = record
    reading.value = await api.readingProgress(props.site, props.novelId)
    error.value = null
    await refreshProgress()
    notify(`目录已更新：${record.episodes.length} 话 / ${record.chapters.length} 章`)
  } catch (err) {
    notify(err instanceof Error ? err.message : '更新目录失败', 'error')
  } finally {
    refreshing.value = false
  }
}

async function confirmTrash(): Promise<void> {
  removing.value = true
  try {
    await api.trash(props.site, props.novelId)
    pendingTrash.value = false
    notify(`「${catalog.value?.meta.title ?? props.novelId}」已移入回收站`)
    void router.push('/')
  } catch (err) {
    notify(err instanceof Error ? err.message : '删除失败', 'error')
  } finally {
    removing.value = false
  }
}

onMounted(() => {
  void load()
  translationPoll = setInterval(() => {
    void api.episodeTranslations(props.site, props.novelId).then((value) => { translations.value = value.episodes }).catch(() => {})
  }, 3000)
})
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  if (translationPoll) clearInterval(translationPoll)
})
</script>

<template>
  <main class="novel section-wrap">
    <nav class="crumbs">
      <RouterLink to="/" class="crumb">← 书架</RouterLink>
      <span v-if="entry" class="crumb-sep">/</span>
      <span v-if="entry" class="crumb-current">{{ entry.source.novelId }}</span>

      <div v-if="entry" class="crumb-actions">
        <RouterLink class="action-icon-button" aria-label="AI 翻译" title="AI 翻译" :to="{ name: 'translation', params: { site, novelId } }">
          <span class="action-icon action-icon--translate" aria-hidden="true" />
        </RouterLink>
        <button class="action-icon-button" type="button" :disabled="refreshing || !!busy" :aria-label="refreshing ? '正在更新目录' : '更新目录'" :title="refreshing ? '正在更新目录' : '更新目录'" :aria-busy="refreshing" @click="handleRefresh">
          <span class="action-icon action-icon--refresh" :class="{ 'is-refreshing': refreshing }" aria-hidden="true" />
        </button>
        <button class="action-icon-button action-icon-button--danger" type="button" :disabled="!!busy || refreshing" aria-label="删除作品" title="删除作品" @click="pendingTrash = true"><span class="action-icon action-icon--trash" aria-hidden="true" /></button>
      </div>
    </nav>

    <div v-if="loading" class="state">
      <span class="loading-bar" />
      <p class="muted">读取作品…</p>
    </div>

    <div v-else-if="error" class="state">
      <p class="state-title">{{ error }}</p>
      <div class="state-actions">
        <button class="pill pill--small" type="button" :disabled="refreshing" @click="handleRefresh">
          <span>{{ refreshing ? '抓取中…' : '重新抓取目录' }}</span>
          <span class="pill__arrow" aria-hidden="true">↗</span>
        </button>
        <RouterLink to="/" class="pill pill--ghost pill--small"><span>返回书架</span></RouterLink>
      </div>
    </div>

    <NovelDetail
      v-else-if="catalog"
      v-model:concurrency="concurrency"
      :catalog="catalog"
      :downloaded="downloaded"
      :translations="translations"
      :reading="reading"
      :reading-saving="readingSaving"
      @update-reading="updateReading"
      :busy="busy"
      :job="job"
      @open="openEpisode"
      @download="handleDownload"
    />

    <ConfirmDialog
      :open="pendingTrash"
      title="移入回收站？"
      :message="`「${catalog?.meta.title ?? ''}」会从书架隐藏，目录与已下载的正文仍保留在磁盘上，可在回收站恢复。`"
      confirm-label="移入回收站"
      :busy="removing"
      @confirm="confirmTrash"
      @cancel="pendingTrash = false"
    />
  </main>
</template>

<style scoped>
.novel {
  flex: 1;
  padding-bottom: 56px;
}

.crumbs {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 0 10px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--faint);
}

.crumb {
  color: var(--muted);
  transition: color 0.2s ease;
}

.crumb:hover {
  color: var(--blue-dark);
}

.crumb-sep {
  color: #c9d5db;
}

.crumb-current {
  color: var(--ink);
}

.crumb-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
}

.action-icon-button {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--blue-dark);
  cursor: pointer;
  transition: background .18s ease, opacity .18s ease;
}
.action-icon-button:hover:not(:disabled) { background: var(--blue-soft); }
.action-icon-button--danger { color: #c34f49; }
.action-icon-button--danger:hover:not(:disabled) { background: rgb(195 79 73 / 10%); }
.action-icon-button:disabled { opacity: .45; cursor: not-allowed; }
.action-icon { display: block; width: 28px; height: 28px; background: currentColor; -webkit-mask: var(--action-icon) center / contain no-repeat; mask: var(--action-icon) center / contain no-repeat; }
.action-icon--translate { --action-icon: url('/icons/translate.svg'); width: 32px; }
.action-icon--refresh { --action-icon: url('/icons/arrow.clockwise.circle.fill.svg'); }
.action-icon--trash { --action-icon: url('/icons/trash.circle.fill.svg'); }
.is-refreshing { animation: refresh-spin 1.2s linear infinite; }
@keyframes refresh-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .is-refreshing { animation: none; } }
:global(html[data-theme='dark']) .action-icon-button--danger { color: #ed9289; }

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 90px 20px;
  border-radius: var(--radius-lg);
  text-align: center;
}

.state-title {
  font-size: 13.5px;
  color: var(--muted);
}

.state-actions {
  display: flex;
  align-items: center;
  gap: 10px;
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

@media (max-width: 580px) {
  .novel { padding-bottom: 36px; }
  .crumbs { flex-wrap: wrap; gap: 8px 10px; padding: 12px 0 8px; }
  .crumb-current { overflow-wrap: anywhere; }
  .crumb-actions { width: 100%; margin-left: 0; gap: 2px; }
  .crumb-actions button { min-height: 44px; }
  .state-actions { flex-wrap: wrap; justify-content: center; }
}

</style>
