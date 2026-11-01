<script setup lang="ts">
import { nextTick, ref, useId } from 'vue'
import { readingLabels, readingStates, type ReadingState } from '@shared/reading'
const props = withDefaults(defineProps<{ status: ReadingState; label: string; count?: number; disabled?: boolean; compact?: boolean }>(), { count: 1, disabled: false, compact: false })
const emit = defineEmits<{ change: [status: ReadingState] }>()
const headingId = useId()
const dialog = ref<HTMLDialogElement>()
const open = ref(false)
const selected = ref<ReadingState>('unread')
async function show(): Promise<void> {
  if (props.disabled || !props.count) return
  selected.value = props.status
  open.value = true
  await nextTick()
  dialog.value?.showModal()
}
function close(): void { dialog.value?.close(); open.value = false }
function apply(): void {
  if (props.disabled) return
  emit('change', selected.value)
  close()
}
function backdrop(event: MouseEvent): void {
  if (event.target !== dialog.value || !dialog.value) return
  const rect = dialog.value.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close()
}
</script>

<template>
  <button class="reading-state-trigger" :class="[`state-${status}`, { compact }]" type="button" :disabled="disabled || !count" :aria-label="`${label}：${readingLabels[status]}，点击编辑阅读状态`" :title="`${label}：${readingLabels[status]}，点击编辑`" aria-haspopup="dialog" :aria-expanded="open" @click.stop="show"><span class="reading-state-icon" aria-hidden="true" /></button>
  <dialog v-if="open" ref="dialog" class="reading-state-dialog" :aria-labelledby="headingId" @cancel.prevent="close" @close="open = false" @click="backdrop">
    <header><div><h2 :id="headingId">编辑阅读状态</h2><p>{{ label }}<span v-if="count > 1"> · {{ count }} 话</span></p></div><button class="close-button" type="button" aria-label="关闭阅读状态编辑" @click="close">×</button></header>
    <p v-if="count > 1" class="batch-note">将统一修改此范围内全部 {{ count }} 话的阅读状态。</p>
    <div class="reading-state-options" role="group" aria-label="选择阅读状态"><button v-for="state in readingStates" :key="state" type="button" :class="[`state-${state}`, { selected: selected === state }]" :aria-pressed="selected === state" :disabled="disabled" @click="selected = state"><span class="reading-state-icon" aria-hidden="true" /><span>{{ readingLabels[state] }}</span></button></div>
    <footer><button class="pill pill--ghost pill--small" type="button" @click="close">取消</button><button class="pill pill--small" type="button" :disabled="disabled" @click="apply">确认修改</button></footer>
  </dialog>
</template>

<style scoped>
.state-unread { --state-ink: var(--reading-unread); --state-icon: url('/icons/xmark.seal.fill.svg'); }
.state-reading { --state-ink: var(--reading-active); --state-icon: url('/icons/seal.fill.svg'); }
.state-read { --state-ink: var(--reading-done); --state-icon: url('/icons/checkmark.seal.fill.svg'); }
.reading-state-trigger { flex: none; display: inline-grid; place-items: center; width: 40px; height: 44px; padding: 0; border: 0; border-radius: 12px; color: var(--state-ink); background: transparent; cursor: pointer; }
.reading-state-trigger.compact { width: 32px; }
.reading-state-trigger:hover:not(:disabled) { background: var(--paper); }
.reading-state-trigger:disabled { opacity: .45; cursor: not-allowed; }
.reading-state-icon { display: block; flex: none; width: 18px; height: 18px; background: var(--state-ink); -webkit-mask: var(--state-icon) center / contain no-repeat; mask: var(--state-icon) center / contain no-repeat; }
.reading-state-dialog { width: min(420px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); overflow: auto; margin: auto; padding: 24px; border: 1px solid var(--line); border-radius: 24px; background: var(--white); color: var(--ink); box-shadow: var(--shadow-soft); font-family: var(--sans); }
.reading-state-dialog::backdrop { background: rgb(10 20 28 / 42%); backdrop-filter: blur(4px); }
.reading-state-dialog header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.reading-state-dialog header > div { min-width: 0; }
.reading-state-dialog h2 { font: 600 18px/1.6 var(--sans); letter-spacing: 0; }
.reading-state-dialog p { margin-top: 8px; color: var(--muted); font-size: 13px; line-height: 1.8; overflow-wrap: anywhere; }
.close-button { display: grid; place-items: center; flex: none; width: 36px; height: 36px; padding: 0; border-radius: 50%; background: transparent; color: var(--muted); font-size: 24px; cursor: pointer; }
.close-button:hover { background: var(--paper); }
.reading-state-dialog .batch-note { margin-top: 18px; }
.reading-state-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 24px; }
.reading-state-options button { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 18px 8px; border: 1px solid var(--line); border-radius: 16px; background: var(--paper); color: var(--ink); font: inherit; font-size: 14px; cursor: pointer; }
.reading-state-options button.selected { border-color: var(--state-ink); box-shadow: inset 0 0 0 1px var(--state-ink); }
.reading-state-options .reading-state-icon { width: 28px; height: 28px; }
.reading-state-dialog footer { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 10px; margin-top: 26px; }
@media (max-width: 480px) { .reading-state-dialog { padding: 20px 16px; }.reading-state-options { gap: 8px; } }
</style>
