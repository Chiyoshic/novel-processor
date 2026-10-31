<script setup lang="ts">
import { useToast } from '@/stores/toast'

const { toast } = useToast()
</script>

<template>
  <Transition name="toast">
    <div v-if="toast" class="toast" :class="`toast--${toast.tone}`">
      <span class="status-dot" :class="{ 'status-dot--live': toast.tone === 'ok' }" />
      <span>{{ toast.message }}</span>
    </div>
  </Transition>
</template>

<style scoped>
.toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  z-index: 95;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(560px, calc(100vw - 40px));
  padding: 12px 20px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgb(255 255 255 / 94%);
  box-shadow: 0 18px 40px rgb(49 83 105 / 16%);
  backdrop-filter: blur(12px);
  font-size: 12.5px;
  color: var(--ink);
  transform: translateX(-50%);
}

.toast--error {
  border-color: rgb(214 158 158 / 50%);
}

.toast--error .status-dot {
  background: #c98d8d;
  box-shadow: 0 0 0 4px rgb(201 141 141 / 16%);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
