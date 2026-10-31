<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { LibraryEntry } from '@/api'
import { api } from '@/api'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { notify } from '@/stores/toast'

const items = ref<LibraryEntry[]>([])
const total = ref(0)
const loading = ref(true)
const busy = ref(false)
const error = ref<string | null>(null)

const pendingPurge = ref<LibraryEntry | null>(null)
const pendingEmpty = ref(false)

const emptyHint = computed(() => `回收站中共 ${total.value} 部作品`)

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[1]}/${m[2]}/${m[3]}` : '—'
}

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const result = await api.library({ trashed: true, limit: 200 })
    items.value = result.items
    total.value = result.total
  } catch (err) {
    // 读取失败必须与「回收站为空」区分开，否则会误导成「删了但没进去」
    error.value = err instanceof Error ? err.message : '读取回收站失败'
  } finally {
    loading.value = false
  }
}

async function restore(entry: LibraryEntry): Promise<void> {
  busy.value = true
  try {
    await api.restore(entry.site, entry.novelId)
    await load()
    notify(`已恢复「${entry.title}」`)
  } catch (err) {
    notify(err instanceof Error ? err.message : '恢复失败', 'error')
  } finally {
    busy.value = false
  }
}

async function confirmPurge(): Promise<void> {
  const entry = pendingPurge.value
  if (!entry) return
  busy.value = true
  try {
    await api.purge(entry.site, entry.novelId)
    pendingPurge.value = null
    await load()
    notify(`已永久删除「${entry.title}」`)
  } catch (err) {
    notify(err instanceof Error ? err.message : '删除失败', 'error')
  } finally {
    busy.value = false
  }
}

async function confirmEmpty(): Promise<void> {
  busy.value = true
  try {
    const result = await api.emptyTrash()
    pendingEmpty.value = false
    await load()
    notify(`已清空回收站，永久删除 ${result.removed} 部作品`)
  } catch (err) {
    notify(err instanceof Error ? err.message : '清空失败', 'error')
  } finally {
    busy.value = false
  }
}

onMounted(() => void load())
</script>

<template>
  <main class="trash section-wrap">
    <nav class="crumbs">
      <RouterLink to="/" class="crumb">← 书架</RouterLink>
      <span class="crumb-sep">/</span>
      <span class="crumb-current">回收站</span>
    </nav>

    <header class="trash-head">
      <div class="head-left">
        <h1>回收站</h1>
        <span class="summary">{{ emptyHint }}</span>
      </div>
      <div class="head-actions">
        <button class="text-btn" type="button" :disabled="loading || busy" @click="load">刷新</button>
        <button
          v-if="items.length > 0"
          class="pill pill--ghost pill--small"
          type="button"
          :disabled="busy"
          @click="pendingEmpty = true"
        >
          <span>清空回收站</span>
        </button>
      </div>
    </header>

    <p class="hint">
      移入回收站的作品只是从书架隐藏，目录与正文仍保留在磁盘上。永久删除才会移除文件，且不可撤销。
    </p>

    <div v-if="loading" class="state">
      <span class="loading-bar" />
      <p class="muted">读取回收站…</p>
    </div>

    <div v-else-if="error" class="state">
      <p class="state-title">读取回收站失败</p>
      <p class="muted">{{ error }}</p>
      <button class="pill pill--ghost pill--small" type="button" @click="load">
        <span>重试</span>
      </button>
    </div>

    <div v-else-if="items.length === 0" class="state">
      <p class="state-title">回收站是空的</p>
      <p class="muted">从书架删除的作品会先出现在这里。</p>
    </div>

    <ul v-else class="rows">
      <li v-for="entry in items" :key="`${entry.site}/${entry.novelId}`" class="row">
        <div class="row-main">
          <p class="row-title">{{ entry.title }}</p>
          <p class="row-meta">
            <span>{{ entry.author || '未知作者' }}</span>
            <span class="dot">·</span>
            <span>{{ entry.downloaded }} / {{ entry.episodeCount }} 话</span>
            <span class="dot">·</span>
            <span>删除于 {{ formatDate(entry.deletedAt) }}</span>
          </p>
        </div>
        <div class="row-actions">
          <button class="pill pill--ghost pill--small" type="button" :disabled="busy" @click="restore(entry)">
            <span>恢复</span>
          </button>
          <button class="text-danger" type="button" :disabled="busy" @click="pendingPurge = entry">永久删除</button>
        </div>
      </li>
    </ul>

    <ConfirmDialog
      :open="pendingPurge !== null"
      danger
      title="永久删除这部作品？"
      :message="`「${pendingPurge?.title ?? ''}」的目录与已下载的 ${pendingPurge?.downloaded ?? 0} 话正文会从磁盘移除，无法恢复。`"
      confirm-label="永久删除"
      :busy="busy"
      @confirm="confirmPurge"
      @cancel="pendingPurge = null"
    />

    <ConfirmDialog
      :open="pendingEmpty"
      danger
      title="清空回收站？"
      :message="`将永久删除 ${total} 部作品及其全部正文文件，无法恢复。`"
      confirm-label="清空"
      :busy="busy"
      @confirm="confirmEmpty"
      @cancel="pendingEmpty = false"
    />
  </main>
</template>

<style scoped>
.trash {
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

.trash-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-top: 10px;
}

.head-left {
  display: flex;
  align-items: baseline;
  gap: 14px;
}

.head-left h1 {
  font-size: 28px;
  letter-spacing: -0.05em;
}

.summary {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--faint);
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.text-btn {
  border: 0;
  background: none;
  padding: 0;
  font-size: 11.5px;
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

.hint {
  margin-top: 14px;
  max-width: 640px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--muted);
}

.rows {
  list-style: none;
  margin: 22px 0 0;
  padding: 0;
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 46%);
  overflow: hidden;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 20px;
}

.row-main {
  min-width: 0;
}

.row-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 5px;
  font-family: var(--mono);
  font-size: 10px;
  color: var(--faint);
}

.dot {
  color: #c9d5db;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
}

.text-danger {
  border: 0;
  background: none;
  padding: 0;
  font-size: 11.5px;
  color: #b4544f;
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 78px 20px;
  margin-top: 22px;
  border-radius: var(--radius-lg);
  text-align: center;
}

.state-title {
  font-family: var(--display);
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
}

.state p.muted {
  font-size: 12.5px;
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

@media (max-width: 640px) {
  .row {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
}
</style>
