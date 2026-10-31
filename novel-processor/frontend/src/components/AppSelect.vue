<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { SelectOption } from '@/components/select-option'

const props = withDefaults(
  defineProps<{
    modelValue: string
    label: string
    options: SelectOption[]
    disabled?: boolean
    placement?: 'up' | 'down'
  }>(),
  { disabled: false, placement: 'down' },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const open = ref(false)

const selected = computed(() => props.options.find((option) => option.value === props.modelValue) ?? null)
const selectedLabel = computed(() => selected.value?.label ?? '选择来源')

function choose(value: string): void {
  emit('update:modelValue', value)
  open.value = false
  trigger.value?.focus()
}

function toggle(): void {
  if (props.disabled) return
  open.value = !open.value
}

function outside(event: PointerEvent): void {
  if (!root.value?.contains(event.target as Node)) open.value = false
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    open.value = false
    trigger.value?.focus()
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!open.value) {
      open.value = true
      return
    }
    const current = props.options.findIndex((option) => option.value === props.modelValue)
    const direction = event.key === 'ArrowDown' ? 1 : -1
    const next = props.options[(current + direction + props.options.length) % props.options.length]
    if (next) emit('update:modelValue', next.value)
  }
}

onMounted(() => document.addEventListener('pointerdown', outside))
onUnmounted(() => document.removeEventListener('pointerdown', outside))
</script>

<template>
  <div ref="root" class="app-select" @keydown="onKey">
    <button
      ref="trigger"
      class="trigger"
      type="button"
      :disabled="disabled"
      :aria-label="`${label}：${selectedLabel}`"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle"
    >
      <span class="trigger-label">{{ selectedLabel }}</span>
      <span class="chevron" :class="{ 'is-open': open }" aria-hidden="true">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </span>
    </button>

    <div
      v-if="open"
      class="menu"
      :class="{ 'opens-up': placement === 'up' }"
      role="listbox"
      :aria-label="label"
    >
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="option"
        :class="{ selected: option.value === modelValue }"
        role="option"
        :aria-selected="option.value === modelValue"
        @click="choose(option.value)"
      >
        <span class="option-text">
          <span class="option-label">{{ option.label }}</span>
          <span v-if="option.hint" class="option-hint">{{ option.hint }}</span>
        </span>
        <span v-if="option.value === modelValue" class="check" aria-hidden="true">✓</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.app-select {
  position: relative;
  display: inline-flex;
  flex: none;
}

.trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-width: 148px;
  height: 44px;
  padding: 0 12px 0 16px;
  border-radius: 999px;
  background: var(--white);
  color: var(--ink);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.trigger:hover:not(:disabled),
.trigger[aria-expanded='true'] {
  box-shadow: 0 8px 20px rgb(49 83 105 / 8%);
}

.trigger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.trigger:focus-visible,
.option:focus-visible {
  outline: 2px solid var(--blue-dark);
  outline-offset: 2px;
}

.trigger-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 150px;
}

.chevron {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--blue-soft);
  color: var(--blue-dark);
  transition: transform 0.2s ease;
}

.chevron svg {
  width: 11px;
  height: 11px;
}

.chevron.is-open {
  transform: rotate(180deg);
}

.menu {
  position: absolute;
  z-index: 40;
  top: calc(100% + 8px);
  left: 0;
  min-width: 100%;
  width: max-content;
  max-width: min(280px, 100%);
  max-height: min(50vh, 320px);
  overflow-y: auto;
  padding: 6px;
  border-radius: 18px;
  background: rgb(255 255 255 / 97%);
  box-shadow: 0 18px 40px rgb(49 83 105 / 14%);
  backdrop-filter: blur(14px);
}

.menu.opens-up {
  top: auto;
  bottom: calc(100% + 8px);
}

.option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
}

.option:hover,
.option.selected {
  background: var(--blue-soft);
}

.option-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.option-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink);
}

.option-hint {
  font-family: var(--mono);
  font-size: 9.5px;
  letter-spacing: 0.04em;
  color: var(--faint);
}

.check {
  font-size: 11px;
  font-weight: 700;
  color: var(--blue-dark);
}

@media (max-width: 720px) {
  .app-select {
    width: 100%;
  }
  .trigger {
    width: 100%;
    min-height: 42px;
    height: 42px;
    justify-content: space-between;
    font-size: 12px;
  }
}
</style>
