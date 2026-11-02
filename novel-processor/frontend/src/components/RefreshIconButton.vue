<script setup lang="ts">
withDefaults(defineProps<{
  loading?: boolean
  disabled?: boolean
  label?: string
  loadingLabel?: string
}>(), { loading: false, disabled: false, label: '刷新', loadingLabel: '正在刷新' })
</script>

<template>
  <button class="refresh-icon-button" type="button" :disabled="disabled || loading" :aria-label="loading ? loadingLabel : label" :title="loading ? loadingLabel : label" :aria-busy="loading">
    <span class="refresh-icon-button__icon" :class="{ 'is-refreshing': loading }" aria-hidden="true" />
  </button>
</template>

<style scoped>
.refresh-icon-button { display: inline-grid; place-items: center; flex: none; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--blue-dark); cursor: pointer; transition: background .18s ease, opacity .18s ease; }
.refresh-icon-button:hover:not(:disabled) { background: var(--blue-soft); }
.refresh-icon-button:disabled { opacity: .45; cursor: not-allowed; }
.refresh-icon-button__icon { display: block; width: 28px; height: 28px; background: currentColor; -webkit-mask: url('/icons/arrow.clockwise.circle.fill.svg') center / contain no-repeat; mask: url('/icons/arrow.clockwise.circle.fill.svg') center / contain no-repeat; }
.is-refreshing { animation: refresh-spin 1.2s linear infinite; }
@keyframes refresh-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .is-refreshing { animation: none; } }
</style>
