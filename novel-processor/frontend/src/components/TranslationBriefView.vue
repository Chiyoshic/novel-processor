<script setup lang="ts">
import { computed } from 'vue'
import NormalButton from './NormalButton.vue'
import CountBadge from './CountBadge.vue'
import { detectLang } from '@/utils/lang'
import type { TranslationInitialization } from '@shared/translation'
const props = defineProps<{ saved: TranslationInitialization }>()
defineEmits<{ export: [] }>()
const brief = computed(() => props.saved.result)
const styles = computed(() => [
  ['整体笔调', brief.value.style.overall_zh], ['叙事视角', brief.value.style.viewpoint_zh],
  ['叙述方式', brief.value.style.narration_zh], ['对白风格', brief.value.style.dialogue_zh],
  ['行文节奏', brief.value.style.rhythm_zh], ['语言语体', brief.value.style.register_zh],
])
const ruleGroups = computed(() => [
  { title: '世界观与背景', items: brief.value.worldbuilding_zh },
  { title: '称谓规则', items: brief.value.address_rules_zh },
  { title: '翻译规则', items: brief.value.translation_rules_zh },
  { title: '待确认事项', items: brief.value.unresolved_questions_zh },
])
const updated = computed(() => new Date(props.saved.updatedAt).toLocaleString('zh-CN', { hour12: false }))
</script>

<template>
  <section class="brief" lang="zh-CN" aria-label="已保存的翻译材料">
    <header class="brief-header">
      <div class="book-heading">
        <span class="saved-badge">已保存</span>
        <h2>{{ brief.novel.chinese_title }}</h2>
        <p class="metadata">{{ saved.request.modelName }} · {{ saved.request.episodes.length }} 话材料</p>
        <p v-if="saved.request.generation" class="metadata">调用 {{ saved.request.generation.attempts }} 次 · 重试 {{ Math.max(0, saved.request.generation.attempts - 1) }} 次<span v-if="saved.request.generation.durationMs !== undefined"> · 耗时 {{ (saved.request.generation.durationMs / 1000).toFixed(1) }} 秒</span><span v-if="saved.request.generation.jsonRepaired"> · JSON 已修复</span></p>
        <p class="metadata">更新于 <time :datetime="saved.updatedAt">{{ updated }}</time></p>
      </div>
      <NormalButton variant="primary" @click="$emit('export')">
        导出 JSON
        <span class="export-json-icon" aria-hidden="true" />
      </NormalButton>
    </header>

    <section class="brief-section"><h3>剧情梗概</h3><p class="prose">{{ brief.novel.plot_summary_zh }}</p></section>

    <section class="brief-section">
      <h3>角色译名 <CountBadge :count="brief.characters.length" /></h3>
      <div v-if="brief.characters.length" class="character-grid">
        <article v-for="(character, index) in brief.characters" :key="index" class="character-card">
          <header class="character-heading"><div><h4>{{ character.chinese_name }}</h4><p class="original-name" :lang="detectLang(character.original_name)">{{ character.original_name }}</p></div></header>
          <p v-if="character.aliases.length" class="metadata">别名：<template v-for="(alias, aliasIndex) in character.aliases" :key="aliasIndex"><span v-if="aliasIndex">、</span><span :lang="detectLang(alias)">{{ alias }}</span></template></p>
          <p class="identity">{{ character.identity_zh }}</p>
          <dl><template v-if="character.naming_notes_zh"><dt>译名依据</dt><dd>{{ character.naming_notes_zh }}</dd></template><template v-if="character.speech_style_zh"><dt>说话风格</dt><dd>{{ character.speech_style_zh }}</dd></template></dl>
          <div v-if="character.evidence.length" class="chapter-references"><div class="reference-links"><RouterLink v-for="episodeIndex in [...new Set(character.evidence.map((item) => item.episode_index))]" :key="episodeIndex" class="reference-link" :to="{ name: 'reader', params: { site: saved.site, novelId: saved.novelId, index: episodeIndex } }" target="_blank" rel="noopener noreferrer">第{{ episodeIndex }}话</RouterLink></div></div>
        </article>
      </div>
      <p v-else class="empty">所选材料中暂无可确定的角色。</p>
    </section>

    <section class="brief-section"><h3>语言风格</h3><dl class="style-grid"><div v-for="[label, value] in styles" :key="label" class="style-item"><dt>{{ label }}</dt><dd>{{ value || '未确定' }}</dd></div></dl></section>

    <section class="brief-section"><h3>术语对照 <CountBadge :count="brief.terminology.length" /></h3>
      <div v-if="brief.terminology.length" class="terms"><article v-for="(term, index) in brief.terminology" :key="index" class="term"><div class="term-pair"><span :lang="detectLang(term.original)">{{ term.original }}</span><span class="term-arrow" aria-label="译为">→</span><strong>{{ term.chinese }}</strong><span v-if="term.category_zh" class="tag">{{ term.category_zh }}</span></div><p v-if="term.notes_zh" class="term-notes">{{ term.notes_zh }}</p></article></div>
      <p v-else class="empty">所选材料中暂无专有术语。</p>
    </section>

    <section v-for="group in ruleGroups" :key="group.title" class="brief-section"><h3>{{ group.title }} <CountBadge :count="group.items.length" /></h3><ul v-if="group.items.length"><li v-for="(item, index) in group.items" :key="index">{{ item }}</li></ul><p v-else class="empty">{{ group.title === '待确认事项' ? '暂无待确认事项。' : '暂无记录。' }}</p></section>

    <details class="source"><summary>材料来源与原始 JSON</summary><dl class="source-meta"><dt>选取范围</dt><dd>前 {{ saved.request.chapterCount }} {{ saved.request.selectionUnit === 'chapter' ? '章' : '话' }} · {{ saved.request.includeSummary ? '含作品简介' : '不含作品简介' }} · {{ saved.request.includePreface ? '含前言（如有）' : '不含前言' }}</dd><dt>翻译要求</dt><dd>{{ saved.request.requirements || '未设置额外要求' }}</dd><dt>思考等级</dt><dd>{{ saved.request.effectiveReasoningLevel }}</dd><template v-if="saved.request.generation?.startedAt"><dt>模型调用开始</dt><dd>{{ new Date(saved.request.generation.startedAt).toLocaleString('zh-CN', { hour12: false }) }}</dd></template><template v-if="saved.request.generation?.finishedAt"><dt>模型调用结束</dt><dd>{{ new Date(saved.request.generation.finishedAt).toLocaleString('zh-CN', { hour12: false }) }}</dd></template></dl><ol class="episode-list"><li v-for="episode in saved.request.episodes" :key="episode.index">第 {{ episode.index }} 话 · <span :lang="detectLang(episode.title)">{{ episode.title }}</span></li></ol><pre>{{ JSON.stringify(brief, null, 2) }}</pre></details>
  </section>
</template>

<style scoped>
.brief {
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: 'Noto Serif SC', serif;
  font-optical-sizing: auto;
  font-weight: 400;
  font-style: normal;
}
.brief :deep(*) { font-family: inherit; font-optical-sizing: auto; font-style: normal; }
.brief :deep(:lang(ja)) { font-family: 'Noto Serif JP', serif; }

.brief-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 4px 0 30px; }
.book-heading { min-width: 0; }
.saved-badge, .tag { display: inline-flex; align-items: center; border-radius: 999px; background: var(--blue-soft); color: var(--blue-dark); font-size: 12px; line-height: 1.5; padding: 4px 10px; }
h2 { font-size: clamp(24px, 3vw, 32px); font-weight: 700; line-height: 1.65; margin: 16px 0 14px; }
.export-json-icon {
  display: block;
  flex: none;
  width: 18px;
  height: 18px;
  background: currentColor;
  -webkit-mask: url('/icons/text.redaction.svg') center / contain no-repeat;
  mask: url('/icons/text.redaction.svg') center / contain no-repeat;
}
.metadata { color: var(--muted); font-size: 12px; line-height: 1.8; }
.brief-header > button { flex-shrink: 0; }
.brief-section { padding: 30px 0; border-top: 1px solid var(--line); }
h3 { display: flex; align-items: center; gap: 10px; font-size: 19px; font-weight: 700; line-height: 1.7; margin: 0 0 20px; }
.prose { font-size: 16px; line-height: 2.15; white-space: pre-wrap; }
.character-grid, .style-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 26px; }
.character-card, .style-item { background: transparent; border: 0; padding: 0; border-radius: 0; min-width: 0; }
/* 人物间沿用章节线色，以较短的居中线表示次一级分隔。 */
.character-card + .character-card::before {
  content: '';
  display: block;
  width: 64%;
  margin: 0 auto 26px;
  border-top: 1px solid var(--line);
}

.character-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
h4 { font-size: 17px; line-height: 1.6; }
.original-name { font-size: 13px; color: var(--muted); margin-top: 3px; line-height: 1.7; }
.tag { flex-shrink: 0; font-size: 11px; }
.identity, dd, li, .term-notes { font-size: 15px; line-height: 2.05; }
.identity { margin: 10px 0 14px; }
dt { font-size: 13px; font-weight: 600; color: var(--muted); margin: 12px 0 4px; }
dd { margin: 0; white-space: pre-wrap; }
.style-item dt { margin-top: 0; }
summary { cursor: pointer; color: var(--blue-dark); font-size: 13px; line-height: 1.8; padding: 12px 0; }
.chapter-references { margin-top: 12px; }
.reference-links { display: flex; flex-wrap: wrap; gap: 6px 12px; }
.reference-link {
  display: inline-block;
  color: var(--blue-dark);
  font-size: 12px;
  line-height: 1.8;
  font-weight: 600;
  text-decoration: underline;
  text-decoration-thickness: 3px;
  text-underline-offset: 4px;
}
.reference-link:hover { color: var(--ink); }
.reference-link:focus-visible { outline: 2px solid var(--blue-dark); outline-offset: 3px; }
.terms { border: 0; border-radius: 0; }
.term { padding: 18px 0; background: transparent; }
.term + .term { border-top: 1px solid var(--line); }
.term-pair { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 14px; line-height: 1.8; }
.term-arrow { color: var(--muted); }
.term-notes { margin-top: 8px; color: var(--muted); }
ul { margin: 0; padding-left: 20px; } li + li { margin-top: 8px; }
.empty { color: var(--muted); font-size: 13px; line-height: 1.8; }
.source { margin-top: 24px; border-top: 1px solid var(--line); padding-top: 8px; }
.source-meta { margin-bottom: 12px; }.episode-list { padding-left: 22px; max-height: 220px; overflow: auto; }
pre { background: transparent; border: 0; padding: 12px 0; border-radius: 0; font-size: 12px; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 440px; overflow: auto; margin-top: 16px; }
@media (max-width: 1100px) { .character-grid { grid-template-columns: 1fr; } }
@media (max-width: 640px) { .brief-header { flex-direction: column; }.brief-header > button { width: 100%; justify-content: center; }.style-grid { grid-template-columns: 1fr; }.character-card, .style-item { padding: 0; }.prose { font-size: 16px; }.brief-section { padding: 20px 0; } }
</style>
