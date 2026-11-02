<script setup lang="ts">
withDefaults(defineProps<{
  type?: 'button' | 'submit' | 'reset'
  href?: string
  variant?: 'primary' | 'ghost' | 'functional' | 'secondary'
}>(), { type: 'button', variant: 'primary' })
</script>

<template>
  <component :is="href ? 'a' : 'button'" v-bind="$attrs" :href="href" :type="href ? undefined : type" class="pill compact-button" :class="{ 'pill--ghost': variant === 'ghost', 'compact-button--functional': variant === 'functional', 'compact-button--secondary': variant === 'secondary' }">
    <span v-if="$slots.leadingIcon" class="compact-button__icon" aria-hidden="true"><slot name="leadingIcon" /></span>
    <span class="compact-button__label"><slot /></span>
    <span v-if="$slots.icon" class="compact-button__icon" aria-hidden="true"><slot name="icon" /></span>
  </component>
</template>

<style scoped>
.pill.compact-button {
  flex: none;
  height: 28px;
  min-height: 28px;
  padding: 0 12px;
  gap: 6px;
  font-size: 11px;
  white-space: nowrap;
}
.compact-button__label { line-height: 1.35; }
.compact-button__icon { display: inline-grid; place-items: center; flex: 0 0 12px; width: 12px; height: 12px; }
.compact-button__icon :deep(*) { display: block; width: 12px; height: 12px; }
.compact-button--functional {
  background: var(--blue-soft);
  color: var(--blue-dark);
}
.compact-button--functional:hover:not(:disabled) {
  background: var(--blue-line);
  color: var(--blue-dark);
  box-shadow: none;
}
.compact-button--secondary {
  background: var(--blue-line);
  color: var(--blue-dark);
}
.compact-button--secondary:hover:not(:disabled) {
  background: var(--blue-soft);
  color: var(--blue-dark);
  box-shadow: none;
}
</style>
