<script setup lang="ts">
import { computed } from 'vue'
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
const confidence = { high: '高置信度', medium: '中置信度', low: '待核实' }
const updated = computed(() => new Date(props.saved.updatedAt).toLocaleString('zh-CN', { hour12: false }))
</script>

<template>
  <section class="brief" aria-label="已保存的翻译材料">
    <header class="brief-header">
      <div class="book-heading">
        <span class="saved-badge">已保存至 SQLite</span>
        <h2>{{ brief.novel.chinese_title }}</h2>
        <p class="original-title">{{ brief.novel.original_title }}</p>
        <p class="metadata">{{ saved.request.modelName }} · {{ saved.request.episodes.length }} 话材料</p>
        <p v-if="saved.request.generation" class="metadata">调用 {{ saved.request.generation.attempts }} 次 · 重试 {{ Math.max(0, saved.request.generation.attempts - 1) }} 次<span v-if="saved.request.generation.durationMs !== undefined"> · 耗时 {{ (saved.request.generation.durationMs / 1000).toFixed(1) }} 秒</span><span v-if="saved.request.generation.jsonRepaired"> · JSON 已修复</span></p>
        <p class="metadata">更新于 <time :datetime="saved.updatedAt">{{ updated }}</time></p>
      </div>
      <button class="pill pill--ghost pill--small" type="button" @click="$emit('export')">导出 JSON</button>
    </header>

    <section class="brief-section"><h3>剧情梗概</h3><p class="prose">{{ brief.novel.plot_summary_zh }}</p></section>

    <section class="brief-section">
      <h3>角色译名 <span class="count">{{ brief.characters.length }}</span></h3>
      <div v-if="brief.characters.length" class="character-grid">
        <article v-for="(character, index) in brief.characters" :key="index" class="character-card">
          <header class="character-heading"><div><h4>{{ character.chinese_name }}</h4><p class="original-name">{{ character.original_name }}</p></div><span class="tag">{{ confidence[character.confidence] }}</span></header>
          <p v-if="character.aliases.length" class="metadata">别名：{{ character.aliases.join('、') }}</p>
          <p class="identity">{{ character.identity_zh }}</p>
          <dl><template v-if="character.naming_notes_zh"><dt>译名依据</dt><dd>{{ character.naming_notes_zh }}</dd></template><template v-if="character.speech_style_zh"><dt>说话风格</dt><dd>{{ character.speech_style_zh }}</dd></template></dl>
          <div v-if="character.evidence.length" class="chapter-references"><p class="metadata">来源章节</p><div class="reference-links"><RouterLink v-for="episodeIndex in [...new Set(character.evidence.map((item) => item.episode_index))]" :key="episodeIndex" class="reference-link" :to="{ name: 'reader', params: { site: saved.site, novelId: saved.novelId, index: episodeIndex } }" target="_blank" rel="noopener noreferrer">第 {{ episodeIndex }} 话 ↗</RouterLink></div></div>
        </article>
      </div>
      <p v-else class="empty">所选材料中暂无可确定的角色。</p>
    </section>

    <section class="brief-section"><h3>语言风格</h3><dl class="style-grid"><div v-for="[label, value] in styles" :key="label" class="style-item"><dt>{{ label }}</dt><dd>{{ value || '未确定' }}</dd></div></dl></section>

    <section class="brief-section"><h3>术语对照 <span class="count">{{ brief.terminology.length }}</span></h3>
      <div v-if="brief.terminology.length" class="terms"><article v-for="(term, index) in brief.terminology" :key="index" class="term"><div class="term-pair"><span>{{ term.original }}</span><span class="term-arrow" aria-label="译为">→</span><strong>{{ term.chinese }}</strong><span v-if="term.category_zh" class="tag">{{ term.category_zh }}</span></div><p v-if="term.notes_zh" class="term-notes">{{ term.notes_zh }}</p></article></div>
      <p v-else class="empty">所选材料中暂无专有术语。</p>
    </section>

    <div class="rule-grid"><section v-for="group in ruleGroups" :key="group.title" class="rule-card"><h3>{{ group.title }} <span class="count">{{ group.items.length }}</span></h3><ul v-if="group.items.length"><li v-for="(item, index) in group.items" :key="index">{{ item }}</li></ul><p v-else class="empty">{{ group.title === '待确认事项' ? '暂无待确认事项。' : '暂无记录。' }}</p></section></div>

    <details class="source"><summary>材料来源与原始 JSON</summary><dl class="source-meta"><dt>选取范围</dt><dd>前 {{ saved.request.chapterCount }} {{ saved.request.selectionUnit === 'chapter' ? '章' : '话' }} · {{ saved.request.includeSummary ? '含作品简介' : '不含作品简介' }} · {{ saved.request.includePreface ? '含前言（如有）' : '不含前言' }}</dd><dt>翻译要求</dt><dd>{{ saved.request.requirements || '未设置额外要求' }}</dd><dt>思考等级</dt><dd>{{ saved.request.effectiveReasoningLevel }}</dd><template v-if="saved.request.generation?.startedAt"><dt>模型调用开始</dt><dd>{{ new Date(saved.request.generation.startedAt).toLocaleString('zh-CN', { hour12: false }) }}</dd></template><template v-if="saved.request.generation?.finishedAt"><dt>模型调用结束</dt><dd>{{ new Date(saved.request.generation.finishedAt).toLocaleString('zh-CN', { hour12: false }) }}</dd></template></dl><ol class="episode-list"><li v-for="episode in saved.request.episodes" :key="episode.index">第 {{ episode.index }} 话 · {{ episode.title }}</li></ol><pre>{{ JSON.stringify(brief, null, 2) }}</pre></details>
  </section>
</template>

<style scoped>
.brief { min-width: 0; overflow-wrap: anywhere; }
.brief-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 4px 0 24px; }
.book-heading { min-width: 0; }
.saved-badge, .tag, .count { display: inline-flex; align-items: center; border-radius: 999px; background: var(--blue-soft); color: var(--blue-dark); font-size: 12px; line-height: 1.5; padding: 4px 10px; }
h2 { font-size: clamp(22px, 3vw, 28px); line-height: 1.5; margin: 14px 0 6px; }
.original-title { font-size: 14px; line-height: 1.8; color: var(--muted); margin-bottom: 12px; }
.metadata { color: var(--muted); font-size: 12px; line-height: 1.8; }
.brief-header > button { flex-shrink: 0; }
.brief-section { padding: 24px 0; border-top: 1px solid var(--line); }
h3 { display: flex; align-items: center; gap: 10px; font-size: 17px; line-height: 1.5; margin: 0 0 16px; }
.count { padding: 2px 9px; font-weight: 500; }
.prose { font-size: 15px; line-height: 2; white-space: pre-wrap; }
.character-grid, .style-grid, .rule-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.character-card, .style-item, .rule-card { background: var(--paper); border: 1px solid var(--line); padding: 20px; border-radius: 20px; min-width: 0; }
.character-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
h4 { font-size: 17px; line-height: 1.6; }
.original-name { font-size: 13px; color: var(--muted); margin-top: 3px; line-height: 1.7; }
.tag { flex-shrink: 0; font-size: 11px; }
.identity, dd, li, .term-notes { font-size: 14px; line-height: 1.9; }
.identity { margin: 10px 0 14px; }
dt { font-size: 12px; font-weight: 600; color: var(--muted); margin: 12px 0 4px; }
dd { margin: 0; white-space: pre-wrap; }
.style-item dt { margin-top: 0; }
summary { cursor: pointer; color: var(--blue-dark); font-size: 13px; line-height: 1.8; padding: 12px 0; }
.chapter-references { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
.reference-links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.reference-link { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; padding: 7px 12px; border-radius: 999px; color: var(--blue-dark); background: var(--blue-soft); font-size: 12px; line-height: 1.6; }
.reference-link:hover { text-decoration: underline; }.reference-link:focus-visible { outline: 2px solid var(--blue-dark); outline-offset: 2px; }
.terms { border: 1px solid var(--line); border-radius: 20px; overflow: hidden; }
.term { padding: 16px 20px; background: var(--paper); }
.term + .term { border-top: 1px solid var(--line); }
.term-pair { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 14px; line-height: 1.8; }
.term-arrow { color: var(--muted); }
.term-notes { margin-top: 8px; color: var(--muted); }
.rule-card h3 { font-size: 16px; }
ul { margin: 0; padding-left: 20px; } li + li { margin-top: 8px; }
.empty { color: var(--muted); font-size: 13px; line-height: 1.8; }
.source { margin-top: 24px; border-top: 1px solid var(--line); padding-top: 8px; }
.source-meta { margin-bottom: 12px; }.episode-list { padding-left: 22px; max-height: 220px; overflow: auto; }
pre { background: var(--paper); border: 1px solid var(--line); padding: 16px; border-radius: 16px; font-size: 12px; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 440px; overflow: auto; margin-top: 16px; }
@media (max-width: 1100px) { .character-grid { grid-template-columns: 1fr; } }
@media (max-width: 640px) { .brief-header { flex-direction: column; }.brief-header > button { width: 100%; justify-content: center; }.style-grid, .rule-grid { grid-template-columns: 1fr; }.character-card, .style-item, .rule-card { padding: 16px; }.prose { font-size: 15px; }.brief-section { padding: 20px 0; } }
</style>
