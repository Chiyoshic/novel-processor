<script setup lang="ts">
import { computed } from 'vue'
import { theme } from '@/theme'

const label = computed(() => {
  if (theme.value === 'system') return '当前跟随系统，点击切换为浅色'
  if (theme.value === 'light') return '当前浅色模式，点击切换为深色'
  return '当前深色模式，点击切换为跟随系统'
})

function cycleTheme(): void {
  theme.value = theme.value === 'system' ? 'light' : theme.value === 'light' ? 'dark' : 'system'
}
</script>

<template>
  <button class="theme-toggle" type="button" :aria-label="label" :title="label" @click="cycleTheme">
    <svg v-if="theme === 'system'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
    <svg v-else-if="theme === 'light'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
    </svg>
    <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20.8 14.2A9 9 0 0 1 9.8 3.2a9 9 0 1 0 11 11Z" />
    </svg>
  </button>
</template>

<style scoped>
.theme-toggle {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.theme-toggle:hover {
  background: var(--blue-soft);
  color: var(--blue-dark);
}

.theme-toggle:focus-visible {
  outline: 2px solid var(--blue-dark);
  outline-offset: 2px;
}

.theme-toggle svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
