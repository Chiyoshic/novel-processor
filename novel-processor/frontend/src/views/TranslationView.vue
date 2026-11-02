<script setup lang="ts">
import BackButton from '@/components/BackButton.vue'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api'
import type { NovelRecord } from '@/lib'
import TranslationWorkspace from '@/components/TranslationWorkspace.vue'
import EpisodeTranslationWorkspace from '@/components/EpisodeTranslationWorkspace.vue'

const props = defineProps<{ site: string; novelId: string }>()
const route = useRoute()
const router = useRouter()
const step = computed(() => route.query.step === 'episodes' ? 'episodes' : 'initialization')
const initialization = ref<InstanceType<typeof TranslationWorkspace>>()
function selectStep(value: string): void { void router.replace({ query: { ...route.query, step: value } }) }
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
    <nav class="crumbs" aria-label="返回导航">
      <BackButton :to="novelRoute">返回作品详情</BackButton>
    </nav>
    <header class="page-head">
      <h1>AI 翻译</h1>
      <p class="novel-title">{{ catalog?.meta.title || novelId }}</p>
    </header>
    <div v-if="loading" class="page-state" role="status">读取作品…</div>
    <div v-else-if="error" class="page-state" role="alert">
      <p>{{ error }}</p>
      <button class="pill pill--small" type="button" @click="load">重新读取</button>
    </div>
    <div v-else-if="catalog" class="translation-layout">
      <AppTabs :model-value="step" block label="翻译流程" :options="[{ value: 'initialization', label: '初始化材料' }, { value: 'episodes', label: '章节翻译' }]" @update:model-value="selectStep" />
      <div class="step-content"><TranslationWorkspace v-show="step === 'initialization'" ref="initialization" :key="JSON.stringify([site, novelId])" :catalog="catalog" /><EpisodeTranslationWorkspace v-if="step === 'episodes'" :key="JSON.stringify([site, novelId, 'episodes'])" :catalog="catalog" @baseline-updated="initialization?.reload()" /></div>
    </div>
  </main>
</template>

<style scoped>
.translation-page { flex: 1; padding-bottom: 56px; color: var(--ink); }
.crumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 20px 0; color: var(--muted); font-size: 12px; }
.crumbs a:hover { color: var(--blue-dark); }
.page-head { margin: 10px 0 26px; }
h1 { font-size: 30px; margin-top: 8px; color: var(--ink); }
.novel-title { margin-top: 10px; color: var(--muted); font-size: 14px; line-height: 1.7; overflow-wrap: anywhere; }
.translation-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; align-items: start; }
.step-content { min-width: 0; }
.page-state { display: grid; justify-items: center; gap: 20px; padding: 60px 16px; color: var(--muted); font-size: 14px; }
@media (max-width: 580px) { .translation-page { padding-bottom: 36px; }.page-head { margin: 4px 0 20px; }h1 { font-size: 26px; }.translation-layout { gap: 14px; } }
</style>
