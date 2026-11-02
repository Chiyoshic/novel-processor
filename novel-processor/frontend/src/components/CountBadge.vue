<script setup lang="ts">
withDefaults(defineProps<{ count: number; tone?: 'primary' | 'danger'; label?: string }>(), { tone: 'primary' })
</script>

<template>
  <span class="count-badge" :class="{ 'count-badge--danger': tone === 'danger' }" :aria-label="label">{{ count }}</span>
</template>

<style scoped>
.count-badge { display: inline-flex; align-items: center; justify-content: center; flex: none; padding: 2px 9px; border-radius: 999px; background: var(--blue-soft); color: var(--blue-dark); font-size: 12px; font-weight: 500; line-height: 1.5; font-variant-numeric: tabular-nums; }
.count-badge--danger { background: #fbe9e7; color: #b34039; }
:global(html[data-theme='dark'] .count-badge--danger) { background: #482b2b; color: #f1a29a; }
</style>
