<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { EpisodeContent, NovelRecord } from '@/lib'
import { api } from '@/api'
import { readingLabels, readingStates, type ReadingState } from '@shared/reading'
import { detectLang } from '@/utils/lang'
import ReaderParagraph from '@/components/ReaderParagraph.vue'
import { createCharacterMatcher, type ReaderCharacter } from '@/lib/reader-characters'
import { readerPreferences as preferences, readerPresets, resetReaderPreferences } from '@/lib/reader-preferences'

const props = defineProps<{ site: string; novelId: string; index: string }>()
const router = useRouter()
const route = useRoute()

const characters = ref<ReaderCharacter[]>([])
const charactersError = ref(false)
const charactersLoading = ref(false)
let charactersVersion = 0
async function loadCharacters(): Promise<void> {
  const version = ++charactersVersion
  charactersLoading.value = true; charactersError.value = false; characters.value = []
  try {
    const value = await api.translationInitialization(props.site, props.novelId)
    if (version === charactersVersion) characters.value = value?.result.characters ?? []
  } catch { if (version === charactersVersion) charactersError.value = true }
  finally { if (version === charactersVersion) charactersLoading.value = false }
}
const matcher = computed(() => createCharacterMatcher(preferences.characterHints ? characters.value : [], translated.value))
const popover = ref<HTMLElement>()
const activeCharacter = ref<{ indices: number[]; anchor: HTMLElement; pinned: boolean; left: number; top: number } | null>(null)
const activeCharacters = computed(() => activeCharacter.value?.indices.map((index) => characters.value[index]!).filter(Boolean) ?? [])
let dismissTimer: ReturnType<typeof setTimeout> | undefined
function cancelDismiss(): void { if (dismissTimer) clearTimeout(dismissTimer); dismissTimer = undefined }
function closeCharacter(): void { cancelDismiss(); activeCharacter.value = null }
function dismissCharacter(): void {
  cancelDismiss()
  if (!activeCharacter.value?.pinned) dismissTimer = setTimeout(closeCharacter, 180)
}
async function inspectCharacter(indices: number[], anchor: HTMLElement, pin: boolean): Promise<void> {
  cancelDismiss()
  const previous = activeCharacter.value
  if (previous?.pinned && !pin) return
  if (pin && previous?.anchor === anchor && previous.pinned) { closeCharacter(); return }
  const rect = anchor.getBoundingClientRect()
  const current = { indices, anchor, pinned: pin, left: Math.max(16, Math.min(rect.left, window.innerWidth - 376)), top: rect.bottom + 10 }
  activeCharacter.value = current
  await nextTick()
  if (activeCharacter.value?.anchor !== anchor || !popover.value) return
  const size = popover.value.getBoundingClientRect()
  current.left = Math.max(16, Math.min(rect.left, window.innerWidth - size.width - 16))
  current.top = rect.bottom + size.height + 26 <= window.innerHeight ? rect.bottom + 10 : Math.max(16, rect.top - size.height - 10)
  activeCharacter.value = { ...current }
}
function outsideCharacter(event: PointerEvent): void {
  const target = event.target as Element | null
  if (!target?.closest('.character-mention, .character-popover')) closeCharacter()
}
function scrollCharacter(event: Event): void {
  if (event.target instanceof Node && popover.value?.contains(event.target)) return
  closeCharacter()
}

const settingsOpen = ref(false)
const catalog = ref<NovelRecord | null>(null)
const content = ref<EpisodeContent | null>(null)
const loading = ref(true)
const missing = ref(false)
const downloading = ref(false)
const error = ref<string | null>(null)
const readingState = ref<ReadingState>('unread')
const readingError = ref('')
const pendingReadingState = ref<ReadingState>('reading')
const readingSaving = ref(0)
const navigating = ref(false)
const reachedEnd = ref(false)
const endMarker = ref<HTMLElement>()
let endObserver: IntersectionObserver | undefined
let readingWrites: Promise<unknown> = Promise.resolve()
function saveReadingStatus(status: ReadingState): Promise<void> {
  const version = episodeVersion
  const { site, novelId } = props
  const index = episodeIndex.value
  pendingReadingState.value = status
  readingSaving.value++
  const operation = readingWrites.catch(() => {}).then(async () => {
    try {
      const result = await api.updateReading(site, novelId, { scope: 'episode', index, status })
      if (version === episodeVersion) { readingState.value = result.episodes.find((episode) => episode.index === index)?.status ?? status; readingError.value = '' }
    } catch (error) {
      if (version === episodeVersion) readingError.value = error instanceof Error ? error.message : '阅读状态保存失败'
      throw error
    } finally { readingSaving.value-- }
  })
  readingWrites = operation
  return operation
}


const episodeIndex = computed(() => Number(props.index))
const hasTranslation = computed(() => !!content.value?.translation?.body)
const translated = computed(() => route.query.language === 'translation' && hasTranslation.value)
const displayed = computed(() => translated.value ? content.value?.translation : content.value)
watch(displayed, async () => {
  reachedEnd.value = false
  endObserver?.disconnect()
  await nextTick()
  if (!endMarker.value || !content.value) return
  endObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) reachedEnd.value = true
  }, { threshold: 1 })
  endObserver.observe(endMarker.value)
}, { flush: 'post' })
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

watch([displayed, () => preferences.characterHints], closeCharacter)

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
  readingState.value = 'unread'; pendingReadingState.value = 'reading'; readingError.value = ''; reachedEnd.value = false
  endObserver?.disconnect()
  try {
    const value = await api.episode(props.site, props.novelId, episodeIndex.value)
    if (version === episodeVersion) {
      content.value = value
      void saveReadingStatus('reading').catch(() => {})
    }
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

async function go(delta: number): Promise<void> {
  if (navigating.value || loading.value) return
  const next = ordered.value[position.value + delta]
  if (next === undefined) return
  navigating.value = true
  const version = episodeVersion
  try {
    await readingWrites.catch(() => {})
    if (version !== episodeVersion) return
    if (delta > 0 && reachedEnd.value) await saveReadingStatus('read')
    if (version !== episodeVersion) return
    await router.push({ name: 'reader', params: { site: props.site, novelId: props.novelId, index: String(next) }, query: route.query })
  } catch { /* Stay on this episode if saving fails; the error offers retry. */ }
  finally { navigating.value = false }
}
async function finishReading(): Promise<void> {
  if (!reachedEnd.value || navigating.value) return
  navigating.value = true
  try { await saveReadingStatus('read'); backToNovel() }
  catch { /* Save error is shown beside the reading controls. */ }
  finally { navigating.value = false }
}
function editReading(event: Event): void {
  const target = event.target as HTMLSelectElement
  const status = target.value as ReadingState
  target.value = readingState.value
  void saveReadingStatus(status).catch(() => {})
}

function backToNovel(): void {
  void router.push({ name: 'novel', params: { site: props.site, novelId: props.novelId } })
}

function onKey(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  if (event.key === 'Escape' && activeCharacter.value) { closeCharacter(); return }
  if (target?.closest('input, textarea, select, button, [role=button], [contenteditable]')) return
  if (event.key === 'ArrowLeft' && hasPrev.value) go(-1)
  else if (event.key === 'ArrowRight' && hasNext.value) go(1)
  else if (event.key === 'Escape') backToNovel()
}

watch(
  () => [props.site, props.novelId, props.index],
  () => { closeCharacter(); void loadCharacters(); void loadEpisode() },
)

onMounted(() => {
  void loadCharacters()
  void Promise.all([loadCatalog(), loadEpisode()])
  window.addEventListener('keydown', onKey)
  document.addEventListener('pointerdown', outsideCharacter)
  window.addEventListener('scroll', scrollCharacter, true)
  window.addEventListener('resize', closeCharacter)
})

onUnmounted(() => {
  episodeVersion++; charactersVersion++; closeCharacter(); endObserver?.disconnect()
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('pointerdown', outsideCharacter)
  window.removeEventListener('scroll', scrollCharacter, true)
  window.removeEventListener('resize', closeCharacter)
})
</script>

<template>
  <main class="reader-page">
    <nav class="crumbs section-wrap" aria-label="阅读导航">
      <button class="crumb" type="button" @click="backToNovel">← {{ novelTitle || '作品' }}</button>
      <span class="crumb-sep" aria-hidden="true">／</span>
      <span class="crumb-current">第 {{ episodeIndex }} 话</span>
    </nav>

    <div class="reading-tools section-wrap">
      <div v-if="content && !loading" class="language-switch tab-selector" role="group" aria-label="正文语言">
        <button type="button" :aria-pressed="!translated" @click="setLanguage('original')">原文</button>
        <button type="button" :aria-pressed="translated" :disabled="!hasTranslation" @click="setLanguage('translation')">中文译文</button>
      </div>
      <RouterLink v-if="content && !loading && !hasTranslation" class="translation-link" :to="{ name: 'translation', params: { site, novelId }, query: { step: 'episodes' } }">去翻译本话 ↗</RouterLink>
      <label v-if="content && !loading" class="reading-state-control">阅读状态<select :value="readingState" :disabled="!!readingSaving || navigating" @change="editReading"><option v-for="state in readingStates" :key="state" :value="state">{{ readingLabels[state] }}</option></select></label>
      <button class="reading-settings-toggle" type="button" :aria-expanded="settingsOpen" aria-controls="reader-settings" @click="settingsOpen = !settingsOpen">
        阅读设置 <span aria-hidden="true">{{ settingsOpen ? '−' : '＋' }}</span>
      </button>
      <p v-if="content?.translation?.stale" class="translation-note">原文已更新，当前译文可能过期。</p>
      <p v-if="content && route.query.language === 'translation' && !hasTranslation" class="translation-note">本话尚无译文，当前显示原文。</p>
      <p v-if="readingError" class="reading-save-error" role="alert">{{ readingError }}<button type="button" :disabled="!!readingSaving" @click="saveReadingStatus(pendingReadingState).catch(() => {})">重新保存</button></p>
    </div>
    <section v-if="settingsOpen" id="reader-settings" class="reader-settings section-wrap" aria-label="阅读设置">
      <header class="settings-heading"><h2>书页排版</h2><button type="button" @click="resetReaderPreferences">恢复默认</button></header>
      <div class="typography-controls">
        <label for="reader-font-size"><span>字号 <output for="reader-font-size">{{ preferences.fontSize }} px</output></span><input id="reader-font-size" v-model.number="preferences.fontSize" type="range" min="14" max="32" step="1" /></label>
        <label for="reader-letter-spacing"><span>字距 <output for="reader-letter-spacing">{{ preferences.letterSpacing.toFixed(3) }} em</output></span><input id="reader-letter-spacing" v-model.number="preferences.letterSpacing" type="range" min="0" max="0.2" step="0.005" /></label>
        <label for="reader-line-height"><span>行距 <output for="reader-line-height">{{ preferences.lineHeight.toFixed(2) }} 倍</output></span><input id="reader-line-height" v-model.number="preferences.lineHeight" type="range" min="1.4" max="3" step="0.05" /></label>
        <label for="reader-paragraph-spacing"><span>段距 <output for="reader-paragraph-spacing">{{ preferences.paragraphSpacing.toFixed(2) }} em</output></span><input id="reader-paragraph-spacing" v-model.number="preferences.paragraphSpacing" type="range" min="0" max="2.5" step="0.05" /></label>
      </div>
      <fieldset class="paper-presets"><legend>书页配色</legend><div class="preset-options"><button v-for="preset in readerPresets" :key="preset.label" type="button" :aria-pressed="preferences.background === preset.background && preferences.textColor === preset.textColor" @click="preferences.background = preset.background; preferences.textColor = preset.textColor"><span class="paper-swatch" :style="{ background: preset.background || 'var(--paper)', color: preset.textColor || 'var(--ink)' }" aria-hidden="true">文</span>{{ preset.label }}</button></div></fieldset>
      <div class="color-controls">
        <label class="custom-color">背景颜色<input :value="preferences.background || '#f7f3eb'" type="color" aria-label="自定义书页背景颜色" @input="preferences.background = ($event.target as HTMLInputElement).value" /><span>{{ preferences.background || '跟随模式' }}</span></label>
        <label class="custom-color">正文颜色<input :value="preferences.textColor || '#3e372e'" type="color" aria-label="自定义正文文字颜色" @input="preferences.textColor = ($event.target as HTMLInputElement).value" /><span>{{ preferences.textColor || '跟随模式' }}</span></label>
      </div>
      <div class="character-hints-setting"><label><input v-model="preferences.characterHints" type="checkbox" />人物简介下划线</label><p>电脑悬浮、手机点击人物名称查看。简介来自当前翻译材料，可能包含后续剧情。</p><p v-if="charactersLoading">读取人物资料…</p><p v-else-if="charactersError">人物资料读取失败，不影响阅读。<button type="button" @click="loadCharacters">重新读取</button></p><p v-else>{{ characters.length ? `已载入 ${characters.length} 条人物资料` : '尚无人物资料，初始化翻译材料后可使用。' }}</p></div>
      <p class="settings-note">调整即时生效，并自动记住在此浏览器中。</p>
    </section>
    <div class="reading-sheet section-wrap">
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
          <p class="book-title">{{ novelTitle }}</p>
          <p class="chapter-number">第 {{ episodeIndex }} 话</p>
          <h1 id="episode-title" class="serif" itemprop="headline">{{ displayed?.title }}</h1>
          <p v-if="catalog?.meta.author.name" class="byline" itemprop="author">{{ catalog.meta.author.name }}</p>
          <div class="meta" aria-label="正文信息">
            <time v-if="publishedText" :datetime="publishedAt" itemprop="datePublished">{{ publishedText }}</time>
            <span v-if="publishedText" class="dot" aria-hidden="true">·</span>
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
              <ReaderParagraph v-for="(paragraph, i) in paragraphs(displayed?.preface ?? '')" :key="i" :parts="matcher(paragraph)" @inspect="inspectCharacter" @leave="dismissCharacter" />
            </div>
          </section>
          <div class="block main">
            <ReaderParagraph v-for="(paragraph, i) in paragraphs(displayed?.body ?? '')" :key="i" :parts="matcher(paragraph)" @inspect="inspectCharacter" @leave="dismissCharacter" />
          </div>
          <section v-if="displayed?.afterword" class="block afterword">
            <p class="block-label">あとがき · 后记</p>
            <div class="block-text">
              <ReaderParagraph v-for="(paragraph, i) in paragraphs(displayed?.afterword ?? '')" :key="i" :parts="matcher(paragraph)" @inspect="inspectCharacter" @leave="dismissCharacter" />
            </div>
          </section>
        </div>

      </article>

      <div v-if="content && !loading && !missing && !error" ref="endMarker" class="reading-end-marker" aria-hidden="true" />
      <nav v-if="content && !loading && !missing && !error" class="pager" aria-label="章节翻页">
          <button class="pill pill--ghost pill--small" type="button" :disabled="!hasPrev || navigating" @click="go(-1)">
            <span aria-hidden="true">←</span>
            <span>上一话</span>
          </button>
          <button class="pill pill--ghost pill--small" type="button" @click="backToNovel">
            <span>目录</span>
          </button>
          <button class="pill pill--small" type="button" :disabled="!hasNext || navigating" @click="go(1)">
            <span>下一话</span>
            <span aria-hidden="true">→</span>
          </button>
      </nav>
      <button v-if="content && !loading && !hasNext" class="finish-reading" type="button" :disabled="!reachedEnd || navigating || !!readingSaving" @click="finishReading">标记已读并返回目录</button>
    </div>
    <aside v-if="activeCharacter" ref="popover" class="character-popover" role="dialog" aria-label="人物简介" lang="zh-CN" :style="{ left: `${activeCharacter.left}px`, top: `${activeCharacter.top}px` }" @pointerenter="cancelDismiss" @pointerleave="dismissCharacter" @focusin="cancelDismiss" @focusout="dismissCharacter">
      <header><span>人物笺</span><button type="button" aria-label="关闭人物简介" @click="closeCharacter">关闭 ×</button></header>
      <p v-if="activeCharacters.length > 1" class="character-ambiguity">此名称对应多条资料</p>
      <section v-for="(character, index) in activeCharacters" :key="index"><h2>{{ character.chinese_name }}</h2><p class="character-original" lang="ja">{{ character.original_name }}</p><p class="character-identity">{{ character.identity_zh || '暂无人物简介。' }}</p><p v-if="character.speech_style_zh" class="character-speech"><span>说话风格</span>{{ character.speech_style_zh }}</p></section>
    </aside>
  </main>
</template>

<style scoped>
.reader-page {
  flex: 1;
  padding-bottom: 80px;
  font-family: var(--serif-sc);
}

/* 工具、书页与翻页共用一条版心，不再把正文包成卡片。 */
.reader-page .section-wrap {
  width: min(42rem, calc(100% - 64px));
}

.crumbs {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 22px 0 20px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--muted);
}
.crumb {
  min-width: 0;
  max-width: 100%;
  min-height: 40px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  text-align: left;
  background: none;
  padding: 0;
  color: inherit;
  cursor: pointer;
}
.crumb:hover { color: var(--ink); }
.crumb-sep, .crumb-current { flex: none; }
.crumb-sep { color: var(--faint); }

.reading-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px 20px;
  padding-bottom: 22px;
  border-bottom: 1px solid var(--line);
}
.language-switch { display: inline-flex; gap: 20px; padding: 0; background: none; }
.language-switch button {
  position: relative;
  min-height: 44px;
  padding: 8px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--muted);
  font-size: 14px;
  letter-spacing: .08em;
  cursor: pointer;
}
.language-switch button[aria-pressed=true] { color: var(--ink); font-weight: 600; }
.language-switch button[aria-pressed=true]::after {
  content: '';
  position: absolute;
  inset: auto 0 0;
  height: 1px;
  background: currentColor;
}
.language-switch button:disabled { opacity: .45; cursor: not-allowed; }
.translation-link, .translation-note { color: var(--muted); font-size: 12px; line-height: 1.9; }
.translation-link { text-decoration: underline; text-underline-offset: 5px; }
.translation-note { flex-basis: 100%; }

.reading-state-control { display: inline-flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; }
.reading-state-control select { min-height: 44px; padding: 8px; background: transparent; color: var(--ink); font-family: inherit; font-size: 14px; }
.reading-save-error { flex-basis: 100%; color: var(--muted); font-size: 13px; line-height: 1.9; }
.reading-save-error button { background: transparent; color: var(--ink); padding: 8px; cursor: pointer; text-decoration: underline; }
.reading-end-marker { height: 1px; }
.finish-reading { display: flex; margin: 20px auto 0; min-height: 44px; padding: 10px 16px; background: transparent; color: var(--ink); font-size: 14px; cursor: pointer; text-decoration: underline; text-underline-offset: 6px; }.finish-reading:disabled { opacity: .45; cursor: not-allowed; }
.reading-settings-toggle { margin-left: auto; gap: 10px; min-height: 44px; padding: 8px 0 8px 12px; background: transparent; color: var(--ink); font-size: 14px; cursor: pointer; }
.reader-settings { padding: 24px 0; border-bottom: 1px solid var(--line); }
.settings-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
.settings-heading h2 { font-family: inherit; font-size: 16px; letter-spacing: .08em; }
.settings-heading button { padding: 8px 0 8px 12px; background: none; color: var(--muted); font-size: 13px; cursor: pointer; }
.typography-controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px 32px; }
.typography-controls label { display: grid; gap: 10px; min-width: 0; font-size: 14px; }
.typography-controls label > span { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.typography-controls output { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.typography-controls input { width: 100%; min-width: 0; height: 28px; margin: 0; accent-color: var(--ink); cursor: pointer; }
.paper-presets { border: 0; padding: 0; margin: 24px 0 0; min-width: 0; }
.paper-presets legend { padding: 0; margin-bottom: 14px; font-size: 14px; }
.preset-options { display: flex; flex-wrap: wrap; gap: 10px 20px; }
.preset-options button { gap: 8px; padding: 6px 0; min-height: 44px; background: transparent; color: var(--muted); font-size: 13px; cursor: pointer; }
.preset-options button[aria-pressed=true] { color: var(--ink); text-decoration: underline; text-underline-offset: 5px; }
.paper-swatch { display: inline-grid; place-items: center; width: 30px; height: 36px; box-shadow: inset 0 0 0 1px var(--line); font-size: 16px; }
.color-controls { display: flex; flex-wrap: wrap; gap: 16px 28px; margin-top: 20px; }
.custom-color { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; font-size: 13px; }
.custom-color input { width: 40px; height: 40px; padding: 2px; background: transparent; cursor: pointer; }
.custom-color span { color: var(--muted); font-size: 12px; }
.settings-note { margin-top: 18px; color: var(--muted); font-size: 12px; line-height: 1.8; }
@media (max-width: 480px) { .typography-controls { grid-template-columns: 1fr; gap: 18px; }.color-controls { flex-direction: column; gap: 12px; } }

.character-hints-setting { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--line); }
.character-hints-setting label { display: flex; align-items: center; gap: 10px; min-height: 44px; font-size: 14px; cursor: pointer; }
.character-hints-setting input { width: 18px; height: 18px; accent-color: var(--reader-brand, var(--ink)); }
.character-hints-setting p { margin-top: 6px; color: var(--muted); font-size: 12px; line-height: 1.9; }
.character-hints-setting button { padding: 4px 8px; background: none; color: var(--ink); font-size: inherit; cursor: pointer; text-decoration: underline; }
.character-popover { position: fixed; z-index: 100; width: min(360px, calc(100vw - 32px)); max-height: min(60vh, 420px); overflow: auto; overscroll-behavior: contain; padding: 20px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); box-shadow: 0 12px 36px rgb(0 0 0 / 18%); font-family: var(--serif-sc); overflow-wrap: anywhere; line-height: 1.9; }
.character-popover > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--muted); font-size: 12px; letter-spacing: .12em; }
.character-popover > header button { min-height: 36px; padding: 4px 0 4px 8px; background: none; color: var(--muted); font-size: 12px; cursor: pointer; }
.character-popover section + section { margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--line); }
.character-popover h2 { font: 600 19px/1.7 var(--serif-sc); letter-spacing: .03em; }
.character-original { color: var(--muted); font: 12px/1.8 var(--serif-jp); }
.character-identity { margin-top: 12px; font-size: 14px; white-space: pre-wrap; }
.character-speech, .character-ambiguity { margin-top: 12px; font-size: 12px; color: var(--muted); }
.character-speech span { display: block; font-weight: 600; }

.reading-sheet {
  padding: 52px 0 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.reader-article { display: block; }
.reader-article:lang(ja) { font-family: var(--serif-jp); }
.head { text-align: center; padding-bottom: 40px; }
.book-title {
  color: var(--muted);
  font-size: 14px;
  line-height: 1.9;
  letter-spacing: .06em;
  overflow-wrap: anywhere;
}
.chapter-number {
  margin-top: 28px;
  color: var(--muted);
  font-size: 12px;
  letter-spacing: .22em;
}
.head h1 {
  margin-top: 16px;
  font-size: clamp(24px, 3vw, 32px);
  font-weight: 600;
  line-height: 1.7;
  letter-spacing: .03em;
  overflow-wrap: anywhere;
  text-wrap: balance;
}
.byline { margin-top: 20px; color: var(--muted); font-size: 14px; letter-spacing: .08em; }
.meta {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin-top: 16px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--muted);
  font-variant-numeric: oldstyle-nums;
}
.dot { color: var(--faint); }
.prose { padding-top: 20px; }
.reader-page .block {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-break: strict;
  font-size: var(--reader-font-size, 18px);
  line-height: var(--reader-line-height, 2.15);
  letter-spacing: var(--reader-letter-spacing, .035em);
  color: var(--reader-text, var(--ink-soft));
}
.block p + p { margin-top: var(--reader-paragraph-spacing, .85em); }
.block + .block { margin-top: 42px; }
.reader-page .preface, .reader-page .afterword {
  padding: 22px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  border-radius: 0;
  background: transparent;
  font-size: calc(var(--reader-font-size, 18px) * .88);
  line-height: var(--reader-line-height, 2.15);
  color: var(--reader-text, var(--ink-soft));
}
.block-label { margin-bottom: 14px; color: var(--muted); font-size: 12px; letter-spacing: .12em; }
.block-text { white-space: pre-wrap; overflow-wrap: anywhere; }

.pager {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16px;
  margin-top: 64px;
  padding-top: 24px;
  border-top: 1px solid var(--line);
}
.pager .pill, .state .pill {
  min-height: 44px;
  padding: 10px 12px;
  border-radius: 0;
  background: transparent;
  color: var(--ink);
  box-shadow: none;
  font-weight: 500;
  font-size: 14px;
  letter-spacing: .08em;
  transform: none;
}
.pager .pill:first-child { justify-self: start; }
.pager .pill:last-child { justify-self: end; }
.pager .pill:hover:not(:disabled), .state .pill:hover:not(:disabled) {
  background: transparent;
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 6px;
  box-shadow: none;
  transform: none;
}
.state { display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 80px 0; text-align: center; }
.state-title, .state .muted { font-size: 15px; line-height: 1.9; color: var(--muted); }
.loading-bar { display: block; height: 1px; width: 64px; background: var(--muted); animation: sweep 1.4s ease-in-out infinite; }
@keyframes sweep { 0%, 100% { opacity: .25; transform: scaleX(.6); } 50% { opacity: 1; transform: scaleX(1); } }
@media (prefers-reduced-motion: reduce) { .loading-bar { animation: none; } }
@media (max-width: 720px) {
  .reader-page { padding-bottom: 48px; }
  .reader-page .section-wrap { width: calc(100% - 40px); }
  .crumbs { padding: 10px 0; font-size: 12px; gap: 8px; }
  .reading-tools { padding-bottom: 16px; gap: 10px 16px; }
  .reading-sheet { padding: 36px 0 0; }
  .head { padding-bottom: 28px; }
  .book-title { font-size: 13px; }
  .chapter-number { margin-top: 22px; }
  .head h1 { font-size: 24px; line-height: 1.65; }
  .pager { gap: 8px; margin-top: 44px; }
  .pager .pill { gap: 6px; padding-inline: 4px; font-size: 13px; }
}
@media print {
  .crumbs, .reading-tools, .reader-settings, .character-popover, .finish-reading, .pager { display: none !important; }
  .reader-page { --ink: #000; --ink-soft: #000; --muted: #555; --faint: #555; --reader-text: #000; }
  .reader-page, .reading-sheet { width: 100% !important; padding: 0; max-width: none; background: #fff; color: #000; box-shadow: none; }
  .reader-article { max-width: 42rem; margin: 0 auto; }
  .head { break-after: avoid; }
  .reader-page .block { color: #000; }
}
</style>
