<script setup lang="ts">
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import CompactButton from './CompactButton.vue'

defineOptions({ inheritAttrs: false })
defineProps<{ to?: RouteLocationRaw }>()
</script>

<template>
  <RouterLink v-if="to" :to="to" custom v-slot="{ href, navigate }">
    <CompactButton v-bind="$attrs" class="back-button" variant="functional" :href="href" @click="navigate">
      <slot>返回</slot>
      <template #leadingIcon><span class="back-button__icon" /></template>
    </CompactButton>
  </RouterLink>
  <CompactButton v-else v-bind="$attrs" class="back-button" variant="functional">
    <slot>返回</slot>
    <template #leadingIcon><span class="back-button__icon" /></template>
  </CompactButton>
</template>

<style scoped>
.back-button__icon {
  display: block;
  width: 12px;
  height: 12px;
  background: currentColor;
  -webkit-mask: url('/icons/arrowshape.turn.up.backward.fill.svg') center / contain no-repeat;
  mask: url('/icons/arrowshape.turn.up.backward.fill.svg') center / contain no-repeat;
}
</style>
