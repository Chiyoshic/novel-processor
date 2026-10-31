<script setup lang="ts">
import { computed } from 'vue'
import type { LibraryEntry } from '@/api'
import { detectLang } from '@/utils/lang'

const props = defineProps<{ entry: LibraryEntry }>()
const emit = defineEmits<{ open: [entry: LibraryEntry] }>()

const lang = computed(() => detectLang(props.entry.title, props.entry.author))

const percent = computed(() => {
  if (props.entry.episodeCount === 0) return 0
  return Math.round((props.entry.downloaded / props.entry.episodeCount) * 100)
})

const complete = computed(
  () => props.entry.episodeCount > 0 && props.entry.downloaded >= props.entry.episodeCount,
)

const statusText = computed(() => {
  const map: Record<string, string> = {
    ongoing: '连载中',
    completed: '已完结',
    hiatus: '休载',
    short: '短篇',
    unknown: '未知',
  }
  return props.entry.statusLabel ?? map[props.entry.status] ?? '未知'
})

function formatNumber(n: number | null): string {
  if (n === null) return '—'
  return n >= 10000 ? `${(n / 10000).toFixed(1)} 万` : n.toLocaleString('en-US')
}
</script>

<template>
  <article class="card" tabindex="0" role="link" @click="emit('open', entry)" @keydown.enter="emit('open', entry)">
    <header class="card-top">
      <span class="chip" :class="{ 'chip--done': complete }">{{ complete ? '已下完' : statusText }}</span>
      <span class="percent">{{ percent }}%</span>
    </header>

    <h3 class="card-title serif" :lang="lang">{{ entry.title }}</h3>
    <p class="card-author">{{ entry.author || '未知作者' }}</p>

    <div class="card-tags">
      <span v-if="entry.genre" class="tag">{{ entry.genre }}</span>
      <span v-for="tag in entry.tags.slice(0, 2)" :key="tag" class="tag">{{ tag }}</span>
    </div>

    <footer class="card-foot">
      <div class="meta">
        <span>{{ entry.episodeCount }} 话</span>
        <span class="dot">·</span>
        <span>{{ formatNumber(entry.wordCount) }} 字</span>
      </div>
      <div class="bar" aria-hidden="true">
        <span class="bar-fill" :class="{ full: complete }" :style="{ width: `${percent}%` }" />
      </div>
      <div class="ratio">{{ entry.downloaded }} / {{ entry.episodeCount }}</div>
    </footer>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  min-height: 236px;
  padding: 20px 20px 16px;
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 52%);
  cursor: pointer;
  transition: background 0.22s ease, border-color 0.22s ease, transform 0.22s ease, box-shadow 0.22s ease;
}

.card:hover {
  background: var(--white);
  transform: translateY(-4px);
  box-shadow: 0 16px 34px rgb(49 83 105 / 11%);
}

.card:focus-visible {
  outline: 2px solid var(--blue-dark);
  outline-offset: 2px;
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.percent {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--blue-dark);
}

.card-title {
  margin-top: 14px;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
  letter-spacing: 0;
  color: var(--ink);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-author {
  margin-top: 7px;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.03em;
  color: var(--faint);
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 12px;
}

.tag {
  padding: 2px 7px;
  border-radius: 5px;
  background: var(--blue-soft);
  color: var(--blue-dark);
  font-size: 9.5px;
  line-height: 1.6;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-foot {
  margin-top: auto;
  padding-top: 14px;
}

.meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--mono);
  font-size: 9.5px;
  color: var(--faint);
}

.dot {
  color: #c9d5db;
}

.bar {
  height: 3px;
  margin-top: 9px;
  border-radius: 999px;
  background: #e8f0f4;
  overflow: hidden;
}

.bar-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--blue);
  transition: width 0.4s ease;
}

.bar-fill.full {
  background: #79c2ac;
}

.ratio {
  margin-top: 7px;
  font-family: var(--mono);
  font-size: 9px;
  color: #b3c0c7;
  text-align: right;
}
</style>
