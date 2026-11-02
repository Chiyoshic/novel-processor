<script setup lang="ts">
import CompactButton from '@/components/CompactButton.vue'
import NovelStatusTag from './NovelStatusTag.vue'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { LibraryEntry } from '@/api'
import ReadingStatusBar from './ReadingStatusBar.vue'
import { detectLang } from '@/utils/lang'

const router = useRouter()
const props = defineProps<{ entry: LibraryEntry }>()
const emit = defineEmits<{ open: [entry: LibraryEntry] }>()

const lang = computed(() => detectLang(props.entry.title, props.entry.author))

const percent = computed(() => {
  if (props.entry.episodeCount === 0) return 0
  return Math.round((props.entry.downloaded / props.entry.episodeCount) * 100)
})

const reading = computed(() => props.entry.reading ?? { total: props.entry.episodeCount, read: 0, reading: 0, unread: props.entry.episodeCount, percent: 0, states: '0'.repeat(props.entry.episodeCount) })

const resumeIndex = computed(() => {
  const summary = props.entry.reading
  if (!summary) return null
  if (summary.furthestReadingIndex !== undefined) return summary.furthestReadingIndex
  // Compatibility while older API instances finish rolling out.
  const position = summary.states.lastIndexOf('1')
  return position >= 0 ? position + 1 : null
})
const readingTarget = computed(() => resumeIndex.value ?? props.entry.reading?.firstEpisodeIndex ?? 1)
function openReader(): void {
  if (!props.entry.episodeCount) return
  void router.push({ name: 'reader', params: { site: props.entry.site, novelId: props.entry.novelId, index: String(readingTarget.value) } })
}

const complete = computed(
  () => props.entry.episodeCount > 0 && props.entry.downloaded >= props.entry.episodeCount,
)

function formatNumber(n: number | null): string {
  if (n === null) return '—'
  return n >= 10000 ? `${(n / 10000).toFixed(1)} 万` : n.toLocaleString('en-US')
}
</script>

<template>
  <article class="card" tabindex="0" role="link" @click="emit('open', entry)" @keydown.enter.self="emit('open', entry)">
    <header class="card-top">
      <NovelStatusTag :status="entry.status" :label="entry.statusLabel" />
      <CompactButton class="card-reading-entry" :disabled="!entry.episodeCount" :title="`进入第 ${readingTarget} 话`" @click.stop="openReader" @keydown.stop>
        {{ resumeIndex !== null ? '继续阅读' : '开始阅读' }}
        <template #icon><span class="card-reading-icon" /></template>
      </CompactButton>
    </header>

    <h3 class="card-title serif" :lang="lang">{{ entry.title }}</h3>
    <div class="card-byline">
      <span class="card-author">{{ entry.author || '未知作者' }}</span>
      <span class="dot" aria-hidden="true">·</span>
      <span>{{ entry.episodeCount }} 话</span>
      <span class="dot" aria-hidden="true">·</span>
      <span>{{ formatNumber(entry.wordCount) }} 字</span>
    </div>

    <div class="card-tags">
      <span v-if="entry.genre" class="tag">{{ entry.genre }}</span>
      <span v-for="tag in entry.tags.slice(0, 2)" :key="tag" class="tag">{{ tag }}</span>
    </div>

    <footer class="card-foot">
      <div class="progress-summary">
        <span>已下载 {{ entry.downloaded }} / {{ entry.episodeCount }}</span>
        <span>{{ percent }}%</span>
        <span>已读 {{ reading.read }} / {{ reading.total }}</span>
        <span>{{ reading.percent }}%</span>
      </div>
      <div class="bar" aria-hidden="true">
        <span class="bar-fill" :class="{ full: complete }" :style="{ width: `${percent}%` }" />
      </div>
      <ReadingStatusBar :progress="reading" compact />
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
  gap: 10px;
  flex-wrap: wrap;
}

.card-reading-entry { margin-left: auto; }

.card-reading-icon {
  display: block;
  width: 12px;
  height: 12px;
  background: currentColor;
  -webkit-mask: url('/icons/play.fill.svg') center / contain no-repeat;
  mask: url('/icons/play.fill.svg') center / contain no-repeat;
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

.card-byline {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 6px;
  margin-top: 7px;
  font-family: var(--mono);
  font-size: 10px;
  line-height: 1.8;
  letter-spacing: .03em;
  color: var(--faint);
}
.card-author { overflow-wrap: anywhere; }

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

.progress-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  font-family: var(--mono);
  font-size: 10px;
  line-height: 1.8;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.progress-summary span { white-space: nowrap; }

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
  background: var(--progress-complete);
}

@media (max-width: 580px) {
  .card { min-height: 0; padding: 16px; }
  .card-title { overflow-wrap: anywhere; }
}
</style>
