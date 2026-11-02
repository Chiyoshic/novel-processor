<script setup lang="ts">
import { computed } from 'vue'
import type { ReadingSummary } from '@shared/reading'
const props = withDefaults(defineProps<{ progress: ReadingSummary; compact?: boolean }>(), { compact: false })
const colors = ['var(--reading-unread)', 'var(--reading-active)', 'var(--progress-complete)']
// Run-length CSS gradient: exact episode positions, without thousands of DOM nodes.
const background = computed(() => {
  const states = props.progress.states
  if (!states.length) return 'var(--line)'
  const stops: string[] = []
  for (let start = 0; start < states.length;) {
    let end = start + 1
    while (end < states.length && states[end] === states[start]) end++
    const color = colors[Number(states[start])] ?? colors[0]
    stops.push(`${color} ${start / states.length * 100}% ${end / states.length * 100}%`)
    start = end
  }
  return `linear-gradient(to right, ${stops.join(',')})`
})
const description = computed(() => `按话序从左到右：未读 ${props.progress.unread} 话，在读 ${props.progress.reading} 话，已读 ${props.progress.read} 话；已读 ${props.progress.percent}%`)
</script>
<template>
  <div class="reading-progress" :class="{ compact }">
    <div v-if="!compact" class="reading-count"><span>已读 {{ progress.read }} / {{ progress.total }} 话</span><strong>{{ progress.percent }}%</strong></div>
    <div class="reading-map" role="img" :aria-label="description" :title="description" :style="{ background }" />
  </div>
</template>
<style scoped>
.reading-progress { margin-top: 16px; min-width: 0; }
.reading-progress.compact { margin-top: 8px; }.compact .reading-map { height: 3px; margin-top: 0; }
.reading-count { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--muted); font-size: 12px; line-height: 1.8; font-variant-numeric: tabular-nums; }
.reading-count strong { color: var(--ink); font-weight: 600; }
.reading-map { width: 100%; height: 6px; border-radius: 999px; margin-top: 8px; }
</style>
