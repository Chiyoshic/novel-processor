<script setup lang="ts">
withDefaults(defineProps<{
  type?: 'button' | 'submit' | 'reset'
  variant?: 'primary' | 'ghost' | 'secondary'
  small?: boolean
}>(), { type: 'button', variant: 'primary', small: false })
</script>

<template>
  <button v-bind="$attrs" :type="type" class="pill normal-button" :class="{ 'pill--ghost': variant === 'ghost', 'pill--small': small, 'normal-button--secondary': variant === 'secondary' }">
    <slot />
  </button>
</template>

<style scoped>
.normal-button--secondary {
  background: var(--blue-line);
  color: var(--blue-dark);
}
.normal-button--secondary:hover:not(:disabled) {
  background: var(--blue-soft);
  color: var(--blue-dark);
  box-shadow: none;
}
</style>
