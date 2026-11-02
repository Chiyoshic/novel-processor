<script setup lang="ts">
import { RouterLink, type RouteLocationRaw } from 'vue-router'
withDefaults(defineProps<{ to?: RouteLocationRaw; label?: string }>(), { label: '删除' })
</script>

<template>
  <component :is="to ? RouterLink : 'button'" :to="to" :type="to ? undefined : 'button'" class="delete-icon-button" :aria-label="label" :title="label">
    <span class="delete-icon-button__icon" aria-hidden="true" />
  </component>
</template>

<style scoped>
.delete-icon-button {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #c34f49;
  cursor: pointer;
  transition: background .18s ease, opacity .18s ease;
}
.delete-icon-button:hover:not(:disabled) { background: rgb(195 79 73 / 10%); }
.delete-icon-button:disabled { opacity: .45; cursor: not-allowed; }
.delete-icon-button__icon {
  display: block;
  width: 28px;
  height: 28px;
  background: currentColor;
  -webkit-mask: url('/icons/trash.circle.fill.svg') center / contain no-repeat;
  mask: url('/icons/trash.circle.fill.svg') center / contain no-repeat;
}
:global(html[data-theme='dark'] .delete-icon-button) { color: #ed9289; }
</style>
