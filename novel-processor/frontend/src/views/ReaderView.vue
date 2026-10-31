<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { EpisodeContent, NovelRecord } from '@/lib'
import { api } from '@/api'
import { detectLang } from '@/utils/lang'

const props = defineProps<{ site: string; novelId: string; index: string }>()
const router = useRouter()
const route = useRoute()

const catalog = ref<NovelRecord | null>(null)
const content = ref<EpisodeContent | null>(null)
const loading = ref(true)
const missing = ref(false)
const downloading = ref(false)
const error = ref<string | null>(null)

const episodeIndex = computed(() => Number(props.index))
const hasTranslation = computed(() => !!content.value?.translation?.body)
const translated = computed(() => route.query.language === 'translation' && hasTranslation.value)
const displayed = computed(() => translated.value ? content.value?.translation : content.value)
function setLanguage(value: 'original' | 'translation'): void { void router.replace({ query: { ...route.query, language: value } }) }
const novelTitle = computed(() => catalog.value?.meta.title ?? '')
const publishedAt = computed(
  () => catalog.value?.episodes.find((episode) => episode.index === episodeIndex.value)?.publishedAt ?? '',
)

// Actual paragraphs remain readable when browser Reader discards page CSS.
function paragraphs(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n').filter((line) => line.trim().length > 0)
}

watch([displayed, novelTitle], () => {
  if (content.value) {
    document.title = [displayed.value?.title, novelTitle.value, 'novel-processor'].filter(Boolean).join(' · ')
  }
})
/** 内容语言：正文用日文还是中文衬线字形 */
const lang = computed(() =>
  translated.value ? 'zh-CN' : detectLang(novelTitle.value, content.value?.title, content.value?.body.slice(0, 200)),
)

const ordered = computed(() => catalog.value?.episodes.map((e) => e.index) ?? [])
const position = computed(() => ordered.value.indexOf(episodeIndex.value))
const hasPrev = computed(() => position.value > 0)
const hasNext = computed(() => position.value >= 0 && position.value < ordered.value.length - 1)

const publishedText = computed(() => {
  const iso = catalog.value?.episodes.find((e) => e.index === episodeIndex.value)?.publishedAt
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[1]}/${m[2]}/${m[3]}` : ''
})

async function loadCatalog(): Promise<void> {
  if (catalog.value) return
  try {
    catalog.value = await api.catalog(props.site, props.novelId)
  } catch {
    catalog.value = null
  }
}

let episodeVersion = 0
async function loadEpisode(): Promise<void> {
  const version = ++episodeVersion
  loading.value = true
  error.value = null
  missing.value = false
  content.value = null
  try {
    const value = await api.episode(props.site, props.novelId, episodeIndex.value)
    if (version === episodeVersion) content.value = value
  } catch (err) {
    if (version !== episodeVersion) return
    const message = err instanceof Error ? err.message : '读取失败'
    if (message.includes('尚未下载')) missing.value = true
    else error.value = message
  } finally {
    if (version === episodeVersion) loading.value = false
  }
}

async function downloadThis(): Promise<void> {
  downloading.value = true
  try {
    await api.download(props.site, props.novelId, { range: String(episodeIndex.value), concurrency: 2 })
    await loadEpisode()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '下载失败'
  } finally {
    downloading.value = false
  }
}

function go(delta: number): void {
  const next = ordered.value[position.value + delta]
  if (next === undefined) return
  void router.push({
    name: 'reader',
    params: { site: props.site, novelId: props.novelId, index: String(next) },
    query: route.query,
  })
}

function backToNovel(): void {
  void router.push({ name: 'novel', params: { site: props.site, novelId: props.novelId } })
}

function onKey(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, button, [contenteditable]')) return
  if (event.key === 'ArrowLeft' && hasPrev.value) go(-1)
  else if (event.key === 'ArrowRight' && hasNext.value) go(1)
  else if (event.key === 'Escape') backToNovel()
}

watch(
  () => [props.site, props.novelId, props.index],
  () => void loadEpisode(),
)

onMounted(async () => {
  await Promise.all([loadCatalog(), loadEpisode()])
  window.addEventListener('keydown', onKey)
})

onUnmounted(() => { episodeVersion++; window.removeEventListener('keydown', onKey) })
</script>

<template>
  <main class="reader-page">
    <nav class="crumbs section-wrap" aria-label="阅读导航">
      <button class="crumb" type="button" @click="backToNovel">← {{ novelTitle || '作品' }}</button>
      <span class="crumb-sep">/</span>
      <span class="crumb-current">第 {{ episodeIndex }} 话</span>
    </nav>

    <div v-if="content && !loading" class="reading-tools section-wrap"><div class="language-switch" role="group" aria-label="正文语言"><button type="button" :aria-pressed="!translated" @click="setLanguage('original')">原文</button><button type="button" :aria-pressed="translated" :disabled="!hasTranslation" @click="setLanguage('translation')">中文译文</button></div><RouterLink v-if="!hasTranslation" class="translation-link" :to="{ name: 'translation', params: { site, novelId }, query: { step: 'episodes' } }">去翻译本话 ↗</RouterLink><p v-if="content.translation?.stale" class="translation-note">原文已更新，当前译文可能过期。</p><p v-if="route.query.language === 'translation' && !hasTranslation" class="translation-note">本话尚无译文，当前显示原文。</p></div>
    <div class="sheet section-wrap">
      <div v-if="loading" class="state">
        <span class="loading-bar" />
        <p class="muted">读取正文…</p>
      </div>

      <div v-else-if="missing" class="state">
        <p class="state-title">第 {{ episodeIndex }} 话尚未下载到本地</p>
        <button class="pill" type="button" :disabled="downloading" @click="downloadThis">
          <span>{{ downloading ? '下载中…' : '下载这一话' }}</span>
          <span class="pill__arrow" aria-hidden="true">↗</span>
        </button>
      </div>

      <div v-else-if="error" class="state">
        <p class="state-title">{{ error }}</p>
        <button class="pill pill--ghost pill--small" type="button" @click="loadEpisode">
          <span>重试</span>
        </button>
      </div>

      <article
        v-else-if="content"
        class="reader-article"
        itemscope
        itemtype="https://schema.org/Article"
        aria-labelledby="episode-title"
        :lang="lang"
      >
        <header class="head">
          <p class="eyebrow">{{ novelTitle }}</p>
          <h1 id="episode-title" class="serif" itemprop="headline">{{ displayed?.title }}</h1>
          <p v-if="catalog?.meta.author.name" class="byline" itemprop="author">{{ catalog.meta.author.name }}</p>
          <div class="meta" aria-label="正文信息">
            <time v-if="publishedText" :datetime="publishedAt" itemprop="datePublished">{{ publishedText }}</time>
            <span class="dot">·</span>
            <span>{{ (displayed?.body.length ?? 0).toLocaleString('en-US') }} 字</span>
            <span v-if="translated">· 中文译文</span><template v-if="content.totalEpisodes">
              <span class="dot">·</span>
              <span>共 {{ content.totalEpisodes }} 话</span>
            </template>
          </div>
        </header>

        <div class="prose serif" :lang="lang" itemprop="articleBody">
          <section v-if="displayed?.preface" class="block preface">
            <p class="block-label">まえがき · 前言</p>
            <div class="block-text">
              <p v-for="(paragraph, i) in paragraphs(displayed?.preface ?? '')" :key="i">{{ paragraph }}</p>
            </div>
          </section>
          <div class="block main">
            <p v-for="(paragraph, i) in paragraphs(displayed?.body ?? '')" :key="i">{{ paragraph }}</p>
          </div>
          <section v-if="displayed?.afterword" class="block afterword">
            <p class="block-label">あとがき · 后记</p>
            <div class="block-text">
              <p v-for="(paragraph, i) in paragraphs(displayed?.afterword ?? '')" :key="i">{{ paragraph }}</p>
            </div>
          </section>
        </div>

      </article>

      <nav v-if="content && !loading && !missing && !error" class="pager" aria-label="章节翻页">
          <button class="pill pill--ghost pill--small" type="button" :disabled="!hasPrev" @click="go(-1)">
            <span aria-hidden="true">←</span>
            <span>上一话</span>
          </button>
          <button class="pill pill--ghost pill--small" type="button" @click="backToNovel">
            <span>目录</span>
          </button>
          <button class="pill pill--small" type="button" :disabled="!hasNext" @click="go(1)">
            <span>下一话</span>
            <span aria-hidden="true">→</span>
          </button>
      </nav>
    </div>
  </main>
</template>

<style scoped>
.reading-tools { max-width: 780px; display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }.language-switch { display: inline-flex; padding: 4px; border: 1px solid var(--line); border-radius: 999px; background: var(--white); }.language-switch button { min-height: 40px; padding: 8px 18px; border: 0; border-radius: 999px; background: transparent; color: var(--muted); font: inherit; font-size: 13px; cursor: pointer; }.language-switch button[aria-pressed=true] { background: var(--blue-soft); color: var(--blue-dark); }.language-switch button:disabled { opacity: .5; cursor: not-allowed; }.translation-link, .translation-note { color: var(--muted); font-size: 12px; line-height: 1.8; }.translation-link { color: var(--blue-dark); }
.reader-page {
  flex: 1;
  padding-bottom: 60px;
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
  border: 0;
  background: none;
  padding: 0;
  color: var(--muted);
  font: inherit;
  cursor: pointer;
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

.sheet {
  max-width: 780px;
  padding: 34px 40px 30px;
  border-radius: var(--radius-lg);
  background: var(--white);
  box-shadow: var(--shadow-soft);
}

.reader-article {
  display: block;
}

.byline {
  margin-top: 10px;
  font-size: 12px;
  color: var(--muted);
}

.block p + p {
  margin-top: 0.5em;
}

.head {
  padding-bottom: 22px;
}

.head h1 {
  margin-top: 12px;
  font-size: clamp(21px, 2.4vw, 27px);
  line-height: 1.35;
  letter-spacing: -0.03em;
}

.meta {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 12px;
  font-family: var(--mono);
  font-size: 10px;
  color: var(--faint);
}

.dot {
  color: #c9d5db;
}

.prose {
  padding-top: 28px;
}

.block {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 15.5px;
  line-height: 2.05;
  color: var(--ink-soft);
  letter-spacing: 0.01em;
}

.block + .block {
  margin-top: 34px;
}

.preface,
.afterword {
  font-size: 13px;
  line-height: 1.9;
  color: var(--muted);
  padding: 16px 20px 18px;
  border-radius: var(--radius-md);
  background: var(--paper);
}

.block-label {
  margin-bottom: 8px;
  font-family: var(--mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--faint);
}

.block-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 40px;
  padding-top: 20px;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 72px 20px;
  text-align: center;
}

.state-title {
  font-size: 13.5px;
  color: var(--muted);
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

@media print {
  .crumbs,
  .reading-tools,
  .pager {
    display: none !important;
  }

  .reader-page,
  .sheet {
    padding: 0;
    max-width: none;
    background: #fff;
    box-shadow: none;
  }

  .reader-article {
    max-width: 42rem;
    margin: 0 auto;
  }
}

@media (max-width: 720px) {
  .sheet {
    padding: 24px 20px;
    border-radius: var(--radius-md);
  }
  .block {
    font-size: 14.5px;
    line-height: 1.95;
  }
}
@media (max-width: 580px) {
  .reader-page { padding-bottom: 36px; }
  .crumbs { padding: 12px 0; }
  .crumb { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .crumb-current, .crumb-sep { flex: none; }
  .sheet { padding: 20px 16px; }
  .head h1, .head .eyebrow { overflow-wrap: anywhere; }
  .meta { flex-wrap: wrap; }
  .pager { gap: 4px; }
  .pager .pill { justify-content: center; gap: 5px; padding-inline: 10px; }
}
</style>
