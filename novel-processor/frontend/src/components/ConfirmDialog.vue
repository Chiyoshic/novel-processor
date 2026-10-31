<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    message?: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
    busy?: boolean
  }>(),
  { confirmLabel: '确认', cancelLabel: '取消', danger: false, busy: false, message: '' },
)

const emit = defineEmits<{ confirm: []; cancel: [] }>()

function onKey(event: KeyboardEvent): void {
  if (!props.open) return
  if (event.key === 'Escape') emit('cancel')
}

watch(
  () => props.open,
  (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
  },
)

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <Transition name="dialog">
    <div v-if="open" class="dialog-root" role="dialog" aria-modal="true" :aria-label="title">
      <div class="dialog-backdrop" @click="emit('cancel')" />
      <div class="dialog-card">
        <p class="eyebrow" :class="{ 'eyebrow--danger': danger }">{{ danger ? '不可撤销' : '请确认' }}</p>
        <h2 class="dialog-title">{{ title }}</h2>
        <p v-if="message" class="dialog-message">{{ message }}</p>
        <div class="dialog-actions">
          <button class="pill pill--ghost pill--small" type="button" :disabled="busy" @click="emit('cancel')">
            <span>{{ cancelLabel }}</span>
          </button>
          <button
            class="pill pill--small"
            :class="{ 'pill--danger': danger }"
            type="button"
            :disabled="busy"
            @click="emit('confirm')"
          >
            <span>{{ busy ? '处理中…' : confirmLabel }}</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.dialog-root {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 24px;
}

.dialog-backdrop {
  position: absolute;
  inset: 0;
  background: rgb(23 38 49 / 30%);
  backdrop-filter: blur(3px);
}

.dialog-card {
  position: relative;
  width: min(420px, 100%);
  padding: 26px 26px 20px;
  border-radius: var(--radius-lg);
  background: var(--white);
  box-shadow: 0 30px 70px rgb(23 38 49 / 22%);
}

.eyebrow--danger {
  color: #b4544f;
}

.dialog-title {
  margin-top: 12px;
  font-size: 19px;
  line-height: 1.35;
  letter-spacing: -0.03em;
}

.dialog-message {
  margin-top: 12px;
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--muted);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 22px;
}

.pill--danger {
  background: #b4544f;
}

.pill--danger:hover:not(:disabled) {
  background: #9c4641;
  box-shadow: 0 12px 22px rgb(180 84 79 / 22%);
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.18s ease;
}

.dialog-enter-active .dialog-card,
.dialog-leave-active .dialog-card {
  transition: transform 0.2s cubic-bezier(0.32, 0.72, 0, 1);
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from .dialog-card,
.dialog-leave-to .dialog-card {
  transform: translateY(8px) scale(0.98);
}
@media (max-width: 580px) {
  .dialog-root { padding: 16px; }
  .dialog-card { padding: 22px 20px; }
  .dialog-actions { flex-wrap: wrap; }
  .dialog-actions .pill { justify-content: center; flex: 1; min-height: 42px; }
}
</style>
