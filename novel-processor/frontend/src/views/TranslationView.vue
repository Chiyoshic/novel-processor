<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api } from '@/api'
import type { NovelRecord } from '@/lib'
import TranslationWorkspace from '@/components/TranslationWorkspace.vue'

const props = defineProps<{ site: string; novelId: string }>()
const catalog = ref<NovelRecord | null>(null)
const loading = ref(true)
const error = ref('')
const novelRoute = computed(() => ({ name: 'novel', params: { site: props.site, novelId: props.novelId } }))
let version = 0

async function load(): Promise<void> {
  const current = ++version
  loading.value = true
  error.value = ''
  catalog.value = null
  try {
    const record = await api.catalog(props.site, props.novelId)
    if (current === version) catalog.value = record
  } catch (err) {
    if (current === version) error.value = err instanceof Error ? err.message : '读取作品失败'
  } finally {
    if (current === version) loading.value = false
  }
}

watch(() => [props.site, props.novelId], () => void load(), { immediate: true })
</script>

<template>
  <main class="translation-page section-wrap">
    <nav class="crumbs" aria-label="面包屑">
      <RouterLink :to="novelRoute">← 返回作品详情</RouterLink>
      <span aria-hidden="true">/</span>
      <span>AI 翻译</span>
    </nav>
    <header class="page-head">
      <p class="eyebrow">AI Translation</p>
      <h1>AI 翻译</h1>
      <p class="novel-title">{{ catalog?.meta.title || novelId }}</p>
    </header>
    <div v-if="loading" class="page-state" role="status">读取作品…</div>
    <div v-else-if="error" class="page-state" role="alert">
      <p>{{ error }}</p>
      <button class="pill pill--small" type="button" @click="load">重新读取</button>
    </div>
    <div v-else-if="catalog" class="translation-layout">
      <aside class="workflow" aria-label="翻译流程">
        <p class="eyebrow">翻译流程</p>
        <ol>
          <li aria-current="step"><span class="step-index">01</span><span>初始化翻译材料</span></li>
        </ol>
      </aside>
      <TranslationWorkspace :key="JSON.stringify([site, novelId])" :catalog="catalog" />
    </div>
  </main>
</template>

<style scoped>
.translation-page { flex: 1; padding-bottom: 56px; }
.crumbs { display: flex; flex-wrap: wrap; gap: 10px; padding: 20px 0; color: var(--muted); font-size: 12px; }
.crumbs a:hover { color: var(--blue-dark); }
.page-head { margin: 10px 0 26px; }
h1 { font-size: 30px; margin-top: 8px; }
.novel-title { margin-top: 10px; color: var(--muted); font-size: 14px; line-height: 1.7; overflow-wrap: anywhere; }
.translation-layout { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 20px; align-items: start; }
.workflow { background: var(--surface-muted); border-radius: var(--radius-lg); padding: 20px 16px; }
.workflow ol { list-style: none; margin: 16px 0; padding: 0; }
.workflow li { display: flex; align-items: center; gap: 10px; background: var(--blue-soft); color: var(--blue-dark); padding: 12px; border-radius: 16px; font-size: 12px; font-weight: 600; }
.step-index { font-size: 11px; }
.page-state { display: grid; justify-items: center; gap: 20px; padding: 60px 16px; color: var(--muted); font-size: 14px; }
@media (max-width: 900px) { .translation-layout { grid-template-columns: 1fr; }.workflow { padding: 16px; }.workflow ol { margin: 12px 0 0; } }
@media (max-width: 580px) { .translation-page { padding-bottom: 36px; }.page-head { margin: 4px 0 20px; }h1 { font-size: 26px; }.translation-layout { gap: 14px; } }
</style>
