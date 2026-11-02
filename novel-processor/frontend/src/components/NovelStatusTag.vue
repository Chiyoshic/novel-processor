<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ status: string; label?: string | null }>()
const labels: Record<string, string> = {
  ongoing: '连载中', completed: '已完结', hiatus: '休载', short: '短篇', unknown: '未知',
}
const tone = computed(() => Object.hasOwn(labels, props.status) ? props.status : 'unknown')
const text = computed(() => props.label || labels[tone.value])
</script>

<template>
  <span class="novel-status" :class="`novel-status--${tone}`">{{ text }}</span>
</template>

<style scoped>
.novel-status {
  display: inline-flex;
  align-items: center;
  flex: none;
  padding: 4px 9px;
  border-radius: 999px;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: .06em;
  white-space: nowrap;
  background: var(--status-chip-bg);
  color: #fff;
}
.novel-status--ongoing { --status-chip-bg: #2879ce; }
.novel-status--completed { --status-chip-bg: #8950ce; }
.novel-status--hiatus { --status-chip-bg: #b66c0c; }
.novel-status--short { --status-chip-bg: #d14c63; }
.novel-status--unknown { --status-chip-bg: #697d91; }

:global(html[data-theme='dark'] .novel-status) { color: #112633; }
:global(html[data-theme='dark'] .novel-status--ongoing) { --status-chip-bg: #78b9ff; }
:global(html[data-theme='dark'] .novel-status--completed) { --status-chip-bg: #c39aff; }
:global(html[data-theme='dark'] .novel-status--hiatus) { --status-chip-bg: #ffc463; }
:global(html[data-theme='dark'] .novel-status--short) { --status-chip-bg: #ff93ac; }
:global(html[data-theme='dark'] .novel-status--unknown) { --status-chip-bg: #adbed0; }

</style>
