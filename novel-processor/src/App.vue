<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import type { EpisodeContent, NovelRecord, SiteInfo } from '@/lib'
import { api, type LibraryEntry } from '@/api'
import AppHeader from '@/components/AppHeader.vue'
import ImportPanel from '@/components/ImportPanel.vue'
import ShelfList from '@/components/ShelfList.vue'
import NovelDetail from '@/components/NovelDetail.vue'
import EpisodeReader from '@/components/EpisodeReader.vue'

const sites = ref<SiteInfo[]>([])
const entries = ref<LibraryEntry[]>([])
const loadingLibrary = ref(true)
const selectedKey = ref<string | null>(null)
const catalog = ref<NovelRecord | null>(null)
const downloaded = ref<Set<number>>(new Set())
const concurrency = ref(4)

const importBusy = ref(false)
const downloadBusy = ref<string | null>(null)
const toast = reactive<{ message: string; tone: 'ok' | 'error' }>({ message: '', tone: 'ok' })
let toastTimer: ReturnType<typeof setTimeout> | undefined
let pollTimer: ReturnType<typeof setInterval> | undefined

const reader = reactive<{
  open: boolean
  loading: boolean
  error: string | null
  content: EpisodeContent | null
  index: number
}>({ open: false, loading: false, error: null, content: null, index: 0 })

const currentEntry = computed(() => entries.value.find((e) => `${e.site}/${e.novelId}` === selectedKey.value) ?? null)
const online = computed(() => sites.value.length > 0)

function notify(message: string, tone: 'ok' | 'error' = 'ok'): void {
  toast.message = message
  toast.tone = tone
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.message = ''
  }, 4200)
}

async function loadLibrary(): Promise<void> {
  loadingLibrary.value = true
  try {
    entries.value = await api.library()
  } catch (err) {
    notify(err instanceof Error ? err.message : '读取书库失败', 'error')
  } finally {
    loadingLibrary.value = false
  }
}

async function selectEntry(entry: LibraryEntry): Promise<void> {
  selectedKey.value = `${entry.site}/${entry.novelId}`
  catalog.value = null
  downloaded.value = new Set()
  try {
    const [record, progress] = await Promise.all([
      api.catalog(entry.site, entry.novelId),
      api.progress(entry.site, entry.novelId),
    ])
    catalog.value = record
    downloaded.value = new Set(progress.indices)
  } catch (err) {
    notify(err instanceof Error ? err.message : '读取作品失败', 'error')
  }
}

async function refreshProgress(): Promise<void> {
  const entry = currentEntry.value
  if (!entry) return
  try {
    const progress = await api.progress(entry.site, entry.novelId)
    downloaded.value = new Set(progress.indices)
    const target = entries.value.find((e) => e.site === entry.site && e.novelId === entry.novelId)
    if (target) target.downloaded = progress.downloaded
  } catch {
    // 轮询失败静默，避免打断下载
  }
}

async function handleImport(input: string): Promise<void> {
  importBusy.value = true
  try {
    const record = await api.importNovel(input)
    await loadLibrary()
    const entry = entries.value.find(
      (e) => e.site === record.source.site && e.novelId === record.source.novelId,
    )
    if (entry) await selectEntry(entry)
    notify(`已导入「${record.meta.title}」，共 ${record.episodes.length} 话`)
  } catch (err) {
    notify(err instanceof Error ? err.message : '导入失败', 'error')
  } finally {
    importBusy.value = false
  }
}

async function handleDownload(payload: { range?: string; all?: boolean; overwrite?: boolean }): Promise<void> {
  const entry = currentEntry.value
  if (!entry || downloadBusy.value) return

  downloadBusy.value = payload.range ? `区间 ${payload.range}` : payload.all ? '全部' : '补缺失'
  pollTimer = setInterval(() => void refreshProgress(), 1200)

  try {
    const result = await api.download(entry.site, entry.novelId, {
      range: payload.range,
      all: payload.all,
      overwrite: payload.overwrite,
      concurrency: concurrency.value,
    })
    await refreshProgress()
    const failed = result.failed.length
    notify(
      failed > 0
        ? `新抓 ${result.fetched} 话，${failed} 话失败`
        : `新抓 ${result.fetched} 话，跳过 ${result.skipped} 话`,
      failed > 0 ? 'error' : 'ok',
    )
  } catch (err) {
    notify(err instanceof Error ? err.message : '下载失败', 'error')
  } finally {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = undefined
    downloadBusy.value = null
  }
}

async function openEpisode(index: number): Promise<void> {
  reader.open = true
  reader.index = index
  reader.content = null
  reader.error = null

  if (!downloaded.value.has(index)) {
    reader.loading = false
    reader.error = `第 ${index} 话尚未下载到本地`
    return
  }

  const entry = currentEntry.value
  if (!entry) return
  reader.loading = true
  try {
    reader.content = await api.episode(entry.site, entry.novelId, index)
  } catch (err) {
    reader.error = err instanceof Error ? err.message : '读取失败'
  } finally {
    reader.loading = false
  }
}

async function fetchCurrent(): Promise<void> {
  if (!currentEntry.value) return
  const index = reader.index
  reader.error = null
  reader.loading = true
  try {
    await api.download(currentEntry.value.site, currentEntry.value.novelId, {
      range: String(index),
      concurrency: concurrency.value,
    })
    await refreshProgress()
    await openEpisode(index)
  } catch (err) {
    reader.loading = false
    reader.error = err instanceof Error ? err.message : '下载失败'
  }
}

const orderedIndices = computed(() => catalog.value?.episodes.map((e) => e.index) ?? [])
const position = computed(() => orderedIndices.value.indexOf(reader.index))
const hasPrev = computed(() => position.value > 0)
const hasNext = computed(() => position.value >= 0 && position.value < orderedIndices.value.length - 1)

function step(delta: number): void {
  const next = orderedIndices.value[position.value + delta]
  if (next !== undefined) void openEpisode(next)
}

onMounted(async () => {
  try {
    sites.value = await api.sites()
  } catch {
    sites.value = []
  }
  await loadLibrary()
  if (entries.value.length > 0) await selectEntry(entries.value[0])
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  if (toastTimer) clearTimeout(toastTimer)
})
</script>

<template>
  <div class="app-shell">
    <AppHeader :sites="sites" :online="online" />

    <ImportPanel :busy="importBusy" @submit="handleImport" />

    <main class="workspace section-wrap">
      <ShelfList
        :entries="entries"
        :selected-key="selectedKey"
        :loading="loadingLibrary"
        @select="selectEntry"
      />

      <NovelDetail
        v-if="catalog"
        v-model:concurrency="concurrency"
        :catalog="catalog"
        :downloaded="downloaded"
        :busy="downloadBusy"
        @open="openEpisode"
        @download="handleDownload"
      />

      <div v-else class="placeholder">
        <div class="placeholder-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
            <path d="M4 5.5h6a2 2 0 0 1 2 2V19a1.6 1.6 0 0 0-1.6-1.6H4z" />
            <path d="M20 5.5h-6a2 2 0 0 0-2 2V19a1.6 1.6 0 0 1 1.6-1.6H20z" />
          </svg>
        </div>
        <p class="eyebrow eyebrow--faint">Workspace</p>
        <h2>选择左侧作品，或先导入一本</h2>
        <p class="muted">
          目录、章节与下载状态会在这里展开。正文按话拆分存放在
          <code>data/episodes</code> 下，随时可以离线阅读。
        </p>
      </div>
    </main>

    <footer class="site-footer section-wrap">
      <div class="footer-brand">
        <span class="footer-name">novel<span>processor</span></span>
        <p>Personal library · local first</p>
      </div>
      <div class="footer-meta">
        <span class="chip">{{ sites.length }} 个站点</span>
        <span class="chip">{{ entries.length }} 部作品</span>
      </div>
      <div class="footer-bottom">
        <span>仅供个人阅读整理，请遵守各站点使用条款。</span>
        <span>Built with the coveone visual system.</span>
      </div>
    </footer>

    <EpisodeReader
      :open="reader.open"
      :loading="reader.loading"
      :error="reader.error"
      :content="reader.content"
      :novel-title="catalog?.meta.title ?? ''"
      :has-prev="hasPrev"
      :has-next="hasNext"
      @close="reader.open = false"
      @prev="step(-1)"
      @next="step(1)"
      @fetch-one="fetchCurrent"
    />

    <Transition name="toast">
      <div v-if="toast.message" class="toast" :class="`toast--${toast.tone}`">
        <span class="status-dot" :class="{ 'status-dot--live': toast.tone === 'ok' }" />
        <span>{{ toast.message }}</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.workspace {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
  padding: 30px 0 64px;
  flex: 1;
}

.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  min-height: 420px;
  padding: 40px;
  border: 1px dashed #cfdde5;
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 38%);
  text-align: center;
}

.placeholder-mark {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border-radius: 18px;
  background: var(--blue-soft);
  color: var(--blue);
  margin-bottom: 6px;
}

.placeholder-mark svg {
  width: 26px;
  height: 26px;
}

.placeholder h2 {
  font-size: 22px;
  letter-spacing: -0.04em;
  color: var(--ink);
}

.placeholder p.muted {
  max-width: 380px;
  font-size: 13px;
  line-height: 1.8;
}

.placeholder code {
  font-family: var(--mono);
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 5px;
  background: var(--blue-soft);
  color: var(--blue-dark);
}

.site-footer {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 20px;
  padding: 30px 0 26px;
  border-top: 1px solid var(--line);
}

.footer-name {
  font-family: var(--display);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.04em;
}

.footer-name span {
  color: var(--blue-dark);
}

.footer-brand p {
  margin-top: 8px;
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #a4b0b5;
}

.footer-meta {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.footer-bottom {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.04em;
  color: #a4b0b5;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  z-index: 80;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(560px, calc(100vw - 40px));
  padding: 12px 20px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgb(255 255 255 / 94%);
  box-shadow: 0 18px 40px rgb(49 83 105 / 16%);
  backdrop-filter: blur(12px);
  font-size: 12.5px;
  color: var(--ink);
  transform: translateX(-50%);
}

.toast--error {
  border-color: rgb(214 158 158 / 50%);
}

.toast--error .status-dot {
  background: #c98d8d;
  box-shadow: 0 0 0 4px rgb(201 141 141 / 16%);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}

@media (max-width: 1024px) {
  .workspace {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 580px) {
  .workspace {
    padding: 20px 0 48px;
  }
  .site-footer {
    grid-template-columns: 1fr;
  }
  .footer-meta {
    order: 3;
  }
  .footer-bottom {
    flex-direction: column;
    gap: 6px;
  }
}
</style>
