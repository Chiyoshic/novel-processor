<script setup lang="ts">
import type { CharacterTextPart } from '@/lib/reader-characters'
defineProps<{ parts: CharacterTextPart[] }>()
const emit = defineEmits<{ inspect: [indices: number[], anchor: HTMLElement, pin: boolean]; leave: [] }>()
function inspect(event: Event, indices: number[], pin: boolean): void {
  emit('inspect', indices, event.currentTarget as HTMLElement, pin)
}
function hover(event: PointerEvent, indices: number[]): void {
  if (event.pointerType === 'mouse') inspect(event, indices, false)
}
</script>

<template>
  <p><template v-for="(part, index) in parts" :key="index"><span v-if="part.characterIndices" class="character-mention" role="button" tabindex="0" aria-haspopup="dialog" :aria-label="`查看${part.text}的人物简介`" @pointerenter="hover($event, part.characterIndices)" @pointerleave="emit('leave')" @focus="inspect($event, part.characterIndices, false)" @blur="emit('leave')" @click.stop="inspect($event, part.characterIndices, true)" @keydown.enter.prevent="inspect($event, part.characterIndices, true)" @keydown.space.prevent="inspect($event, part.characterIndices, true)">{{ part.text }}</span><template v-else>{{ part.text }}</template></template></p>
</template>

<style scoped>
.character-mention { text-decoration: underline; text-decoration-style: dotted; text-decoration-color: var(--reader-brand, var(--reader-accent)); text-underline-offset: .22em; text-decoration-thickness: 1px; cursor: help; -webkit-tap-highlight-color: transparent; }
.character-mention:hover, .character-mention:focus-visible { text-decoration-style: solid; }
.character-mention:focus-visible { outline: 1px solid currentColor; outline-offset: 3px; }
@media print { .character-mention { text-decoration: none; } }
</style>
