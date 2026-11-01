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
    <span class="theme-icon" :class="`theme-icon--${theme}`" aria-hidden="true" />
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

.theme-icon {
  display: block;
  width: 19px;
  height: 19px;
  background: currentColor;
  -webkit-mask: var(--theme-icon) center / contain no-repeat;
  mask: var(--theme-icon) center / contain no-repeat;
}
.theme-icon--system { --theme-icon: url('/icons/display.svg'); }
.theme-icon--light { --theme-icon: url('/icons/sun.max.svg'); }
.theme-icon--dark { --theme-icon: url('/icons/moon.svg'); }
</style>
