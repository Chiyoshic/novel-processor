<script setup lang="ts" generic="T extends string | number = string">
const props = withDefaults(defineProps<{
  modelValue: ReadonlySet<T>
  label: string
  options: { value: T; label: string; disabled?: boolean }[]
  disabled?: boolean
}>(), { disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: Set<T>] }>()

function toggle(value: T, event: MouseEvent): void {
  const target = event.currentTarget as HTMLButtonElement
  if (props.disabled || target.matches(':disabled') || props.options.find(option => option.value === value)?.disabled) return
  const next = new Set(props.modelValue)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="pill-multi-select" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      class="pill-multi-select__option"
      type="button"
      :disabled="disabled || option.disabled"
      :aria-pressed="modelValue.has(option.value)"
      @click="toggle(option.value, $event)"
    >{{ option.label }}</button>
  </div>
</template>

<style scoped>
.pill-multi-select { display: flex; flex-wrap: wrap; gap: 8px; min-width: 0; }
.pill-multi-select__option {
  min-height: 36px;
  padding: 8px 15px;
  border: 0;
  border-radius: 999px;
  background: var(--paper);
  color: var(--muted);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
  cursor: pointer;
  transition: background .18s ease, color .18s ease;
}
.pill-multi-select__option[aria-pressed='true'] { background: #3f719c; color: #fff; }
.pill-multi-select__option:hover:not(:disabled) { background: var(--blue-line); color: var(--blue-dark); }
.pill-multi-select__option[aria-pressed='true']:hover:not(:disabled) { background: #315d83; color: #fff; }
:global(html[data-theme='dark']) .pill-multi-select__option[aria-pressed='true'] { background: #7eb5de; color: #10212a; }
:global(html[data-theme='dark']) .pill-multi-select__option[aria-pressed='true']:hover:not(:disabled) { background: #a4cce7; color: #10212a; }
.pill-multi-select__option:disabled { opacity: .5; cursor: not-allowed; }
</style>
