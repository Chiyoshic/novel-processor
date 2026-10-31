<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { NovelRecord } from '@/lib'
import { api, type DownloadJob } from '@/api'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import NovelDetail from '@/components/NovelDetail.vue'
import { notify } from '@/stores/toast'

const props = defineProps<{ site: string; novelId: string }>()
const router = useRouter()

const catalog = ref<NovelRecord | null>(null)
const downloaded = ref<Set<number>>(new Set())
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
    const [record, progress] = await Promise.all([
      api.catalog(props.site, props.novelId),
      api.progress(props.site, props.novelId),
    ])
    catalog.value = record
    downloaded.value = new Set(progress.indices)
    job.value = progress.job
  } catch (err) {
    error.value = err instanceof Error ? err.message : '读取作品失败'
  } finally {
    loading.value = false
  }
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

onMounted(() => void load())
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <main class="novel section-wrap">
    <nav class="crumbs">
      <RouterLink to="/" class="crumb">← 书架</RouterLink>
      <span v-if="entry" class="crumb-sep">/</span>
      <span v-if="entry" class="crumb-current">{{ entry.source.novelId }}</span>

      <div v-if="entry" class="crumb-actions">
        <button class="text-btn" type="button" :disabled="refreshing || !!busy" @click="handleRefresh">
          {{ refreshing ? '更新中…' : '更新目录' }}
        </button>
        <button class="text-danger" type="button" :disabled="!!busy" @click="pendingTrash = true">删除</button>
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
  padding: 22px 0 14px;
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
  gap: 18px;
  margin-left: auto;
}

.text-btn {
  border: 0;
  background: none;
  padding: 0;
  font-family: inherit;
  font-size: 11px;
  color: var(--muted);
  cursor: pointer;
  transition: color 0.2s ease, border-color 0.2s ease;
}

.text-btn:hover:not(:disabled) {
  color: var(--blue-dark);
}

.text-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.text-danger {
  border: 0;
  background: none;
  padding: 0;
  font-family: inherit;
  font-size: 11px;
  color: #b4544f;
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.text-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

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
  .crumbs { flex-wrap: wrap; gap: 4px 10px; padding: 12px 0; }
  .crumb-current { overflow-wrap: anywhere; }
  .crumb-actions { width: 100%; margin-left: 0; }
  .crumb-actions button { min-height: 44px; }
  .state-actions { flex-wrap: wrap; justify-content: center; }
}
</style>
