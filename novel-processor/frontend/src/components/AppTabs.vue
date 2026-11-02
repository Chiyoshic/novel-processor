<script setup lang="ts" generic="T extends string | number = string">
withDefaults(defineProps<{
  modelValue: T
  label: string
  options: { value: T; label: string; disabled?: boolean }[]
  disabled?: boolean
  block?: boolean
  variant?: 'primary' | 'secondary' | 'inverted'
}>(), { disabled: false, block: false, variant: 'primary' })

const emit = defineEmits<{ 'update:modelValue': [value: T] }>()
</script>

<template>
  <div class="app-tabs tab-selector" :class="{ 'app-tabs--block': block, 'app-tabs--secondary': variant === 'secondary', 'app-tabs--inverted': variant === 'inverted' }" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="app-tabs__button"
      :aria-pressed="modelValue === option.value"
      :disabled="disabled || option.disabled"
      @click="emit('update:modelValue', option.value)"
    >{{ option.label }}</button>
  </div>
</template>

<style scoped>
.app-tabs {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 6px;
  width: fit-content;
  max-width: 100%;
  padding: 4px;
  border: 0;
  border-radius: 999px;
  background: var(--white);
}
.app-tabs__button {
  min-width: 0;
  padding: 10px 16px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  cursor: pointer;
  transition: background .18s ease, color .18s ease;
}
.app-tabs__button[aria-pressed='true'] {
  background: var(--blue-soft);
  color: var(--blue-dark);
}
.app-tabs__button:hover:not(:disabled) { background: var(--blue-soft); color: var(--blue-dark); }
.app-tabs__button:disabled { opacity: .5; cursor: not-allowed; }
.app-tabs--block { display: flex; width: 100%; }
.app-tabs--block .app-tabs__button { flex: 1; }
.app-tabs--secondary {
  gap: 4px;
  padding: 3px;
  /* 一级 tab 的同一套主题配色，通过尺寸区分层级。 */
  background: var(--white);
}
.app-tabs--secondary .app-tabs__button { padding: 7px 12px; font-size: 12px; }
.app-tabs--inverted {
  background: var(--blue-soft);
}
.app-tabs--inverted .app-tabs__button[aria-pressed='true'],
.app-tabs--inverted .app-tabs__button:hover:not(:disabled) {
  background: var(--white);
  color: var(--blue-dark);
}
</style>
