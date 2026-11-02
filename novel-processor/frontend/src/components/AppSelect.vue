<script setup lang="ts" generic="T extends string | number = string">
import { computed, onMounted, onUnmounted, ref, useId, nextTick, watch } from 'vue'
import type { SelectOption } from '@/components/select-option'

const props = withDefaults(
  defineProps<{
    modelValue: T
    label: string
    options: SelectOption<T>[]
    disabled?: boolean
    placement?: 'up' | 'down'
    placeholder?: string
    block?: boolean
    required?: boolean
    softShadow?: boolean
    size?: 'normal' | 'compact'
  }>(),
  { disabled: false, placement: 'down', placeholder: '请选择', block: false, required: false, softShadow: false, size: 'normal' },
)

const emit = defineEmits<{ 'update:modelValue': [value: T] }>()

const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const open = ref(false)
const menuId = useId()

const selected = computed(() => props.options.find((option) => option.value === props.modelValue) ?? null)
const selectedLabel = computed(() => selected.value?.label ?? props.placeholder)

const activeIndex = ref(-1)
const validationValue = computed(() => selected.value && !selected.value.disabled ? String(selected.value.value) : '')
const isDisabled = () => props.disabled || !!trigger.value?.matches(':disabled')

function choose(value: T): void {
  if (isDisabled() || props.options.find((option) => option.value === value)?.disabled) return
  emit('update:modelValue', value)
  open.value = false
  trigger.value?.focus()
}

function openMenu(): void {
  if (isDisabled()) return
  activeIndex.value = props.options.findIndex((option) => option.value === props.modelValue && !option.disabled)
  if (activeIndex.value < 0) activeIndex.value = props.options.findIndex((option) => !option.disabled)
  open.value = true
  scrollActive()
}
function scrollActive(): void {
  void nextTick(() => root.value?.querySelector(`[data-option-index="${activeIndex.value}"]`)?.scrollIntoView({ block: 'nearest' }))
}
function toggle(): void {
  if (open.value) open.value = false
  else openMenu()
}
function outside(event: PointerEvent): void {
  if (!root.value?.contains(event.target as Node)) open.value = false
}
function focusOutside(event: FocusEvent): void {
  if (!root.value?.contains(event.relatedTarget as Node)) open.value = false
}
function onKey(event: KeyboardEvent): void {
  if (isDisabled()) { open.value = false; return }
  if (event.key === 'Tab') { open.value = false; return }
  if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    event.stopPropagation()
    open.value = false
    trigger.value?.focus()
    return
  }
  if ((event.key === 'Enter' || event.key === ' ') && open.value) {
    event.preventDefault()
    const option = props.options[activeIndex.value]
    if (option) choose(option.value)
    return
  }
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    if (!open.value) { openMenu(); return }
    const available = props.options.flatMap((option, index) => option.disabled ? [] : [index])
    if (!available.length) return
    const current = available.indexOf(activeIndex.value)
    const direction = event.key === 'ArrowUp' ? -1 : 1
    activeIndex.value = (event.key === 'Home' ? available[0] : event.key === 'End' ? available[available.length - 1] : available[(current + direction + available.length) % available.length]) ?? -1
    scrollActive()
  }
}
watch(() => props.disabled, (disabled) => { if (disabled) open.value = false })
watch(() => props.options, () => { if (open.value) openMenu() })

onMounted(() => document.addEventListener('pointerdown', outside))
onUnmounted(() => document.removeEventListener('pointerdown', outside))
</script>

<template>
  <div ref="root" class="app-select" :class="{ 'is-open': open, 'app-select--block': block, 'app-select--soft-shadow': softShadow, 'app-select--compact': size === 'compact' }" @keydown="onKey" @focusout="focusOutside">
    <button
      ref="trigger"
      class="trigger"
      type="button"
      :disabled="disabled"
      :aria-label="`${label}：${selectedLabel}`"
      :aria-expanded="open"
      role="combobox"
      aria-haspopup="listbox"
      :aria-required="required || undefined"
      :aria-activedescendant="open && activeIndex >= 0 ? `${menuId}-${activeIndex}` : undefined"
      :aria-controls="open ? menuId : undefined"
      @click="toggle"
    >
      <span class="trigger-label">{{ selectedLabel }}</span>
      <span class="chevron" :class="{ 'is-open': open }" aria-hidden="true">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </span>
    </button>

    <input v-if="required" class="select-validation" tabindex="-1" aria-hidden="true" :value="validationValue" :disabled="disabled" required @invalid.prevent="trigger?.focus()" />

    <div
      v-if="open"
      :id="menuId"
      class="menu"
      :class="{ 'opens-up': placement === 'up' }"
      role="listbox"
      :aria-label="label"
    >
      <button
        v-for="(option, index) in options"
        :key="option.value"
        :id="`${menuId}-${index}`"
        :data-option-index="index"
        :disabled="disabled || option.disabled"
        tabindex="-1"
        type="button"
        class="option"
        :class="{ selected: option.value === modelValue, active: index === activeIndex }"
        role="option"
        :aria-selected="option.value === modelValue"
        @mousedown.prevent
        @click="choose(option.value)"
      >
        <span class="option-text">
          <span class="option-label">{{ option.label }}</span>
          <span v-if="option.hint" class="option-hint">{{ option.hint }}</span>
        </span>
        <span class="check" :class="{ 'is-selected': option.value === modelValue }" aria-hidden="true" />
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

.app-select--block { display: flex; width: 100%; min-width: 0; }
.app-select--block .trigger { min-width: 0; }
.app-select--block .trigger-label { max-width: none; }
.select-validation { position: absolute; width: 1px; height: 1px; padding: 0; opacity: 0; pointer-events: none; }
.app-select.is-open { z-index: 50; }
.app-select--soft-shadow { --select-trigger-shadow: 0 2px 8px rgb(49 83 105 / 6%); }
:global(html[data-theme='dark'] .app-select--soft-shadow) {
  --select-trigger-shadow: 0 3px 14px rgb(255 255 255 / 14%);
}
:global(html[data-theme='dark'] .app-select) {
  --select-menu-shadow: 0 6px 22px rgb(255 255 255 / 10%);
}

.trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-width: 148px;
  width: 100%;
  min-height: 44px;
  height: 44px;
  padding: 0 12px 0 16px;
  border: 0;
  border-radius: 999px;
  background: var(--white);
  color: var(--ink);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--select-trigger-shadow, none);
  transition: background 0.2s ease, box-shadow 0.2s ease;
}

.trigger:hover:not(:disabled),
.trigger[aria-expanded='true'] {
  box-shadow: var(--select-trigger-shadow, var(--shadow-soft));
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
  flex: 1;
  min-width: 0;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 240px;
}

.chevron {
  flex: none;
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
  min-width: max(100%, 112px);
  width: max-content;
  max-width: min(320px, calc(100vw - 40px));
  max-height: min(50vh, 320px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px;
  border-radius: 18px;
  background: var(--white);
  color: var(--ink);
  box-shadow: var(--select-menu-shadow, var(--shadow-lift));
}

.menu.opens-up {
  top: auto;
  bottom: calc(100% + 8px);
}

.option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 14px;
  align-items: center;
  gap: 12px;
  min-height: 42px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  text-align: left;
  line-height: 1.5;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
}

.option:hover:not(:disabled),
.option.active:not(:disabled),
.option.selected {
  background: var(--blue-soft);
}

.option:disabled { opacity: .5; cursor: not-allowed; }

.option-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.option-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink);
}

.option-hint {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--mono);
  font-size: 9.5px;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.check {
  visibility: hidden;
  justify-self: center;
  display: block;
  flex: none;
  width: 12px;
  height: 12px;
  background: var(--blue-dark);
  -webkit-mask: url('/icons/checkmark.svg') center / contain no-repeat;
  mask: url('/icons/checkmark.svg') center / contain no-repeat;
}

.check.is-selected { visibility: visible; }

@media (max-width: 720px) {
  .app-select {
    width: 100%;
  }
  .trigger {
    width: 100%;
    min-width: 0;
    height: 52px;
    min-height: 52px;
    justify-content: space-between;
    padding-inline: 13px;
    font-size: 16px;
  }
}
/* compact 只压缩触发器，菜单项仍保留易点选的高度。 */
.app-select.app-select--compact { width: auto; }
.app-select--compact .trigger {
  height: 28px;
  min-height: 28px;
  min-width: 64px;
  padding: 0 10px;
  gap: 6px;
  font-size: 11px;
}
.app-select--compact .chevron { width: 16px; height: 16px; }
.app-select--compact .chevron svg { width: 9px; height: 9px; }
</style>
