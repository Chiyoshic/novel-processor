<script setup lang="ts" generic="T extends string | number = string">
import AppSelect from '../AppSelect.vue'
import type { SelectOption } from '../select-option'
withDefaults(defineProps<{
  modelValue: T
  label: string
  options: SelectOption<T>[]
  disabled?: boolean
}>(), { disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: T] }>()
</script>

<template>
  <AppSelect class="reader-select" :model-value="modelValue" :label="label" :options="options" :disabled="disabled" @update:model-value="emit('update:modelValue', $event)" />
</template>

<style scoped>
/* 仅复用选择行为；阅读器外观不使用管理页面的白底蓝色胶囊。 */
.reader-select.reader-select { width: auto; font-family: var(--serif-sc); }
.reader-select :deep(.trigger.trigger) {
  width: auto;
  min-width: 88px;
  height: 40px;
  min-height: 40px;
  padding: 6px 0;
  gap: 12px;
  border: 0;
  border-bottom: 1px solid var(--line);
  border-radius: 0;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 14px;
  font-weight: 400;
  box-shadow: none;
}
.reader-select :deep(.chevron.chevron) { background: transparent; color: var(--muted); border-radius: 0; width: 14px; height: 14px; }
.reader-select :deep(.menu.menu) {
  padding: 6px;
  border: 0;
  border-radius: 4px;
  background: var(--paper);
  color: var(--ink);
  box-shadow: 0 4px 16px color-mix(in srgb, var(--ink) 12%, transparent);
}
.reader-select :deep(.option.option) { border-radius: 2px; min-height: 40px; font-family: inherit; }
.reader-select :deep(.option.option:hover:not(:disabled)),
.reader-select :deep(.option.option.active:not(:disabled)),
.reader-select :deep(.option.option.selected) { background: color-mix(in srgb, var(--ink) 8%, transparent); }
.reader-select :deep(.option-label) { color: var(--ink); font-family: inherit; font-size: 14px; font-weight: 400; }
.reader-select :deep(.option-hint) { color: var(--muted); font-family: inherit; }
.reader-select :deep(.check) { background: var(--reader-brand, var(--ink)); }
.reader-select :deep(.trigger:focus-visible),
.reader-select :deep(.option:focus-visible) { outline: 1px solid var(--reader-brand, var(--ink)); outline-offset: 3px; }
</style>
