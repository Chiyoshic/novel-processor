<script setup lang="ts">
import type { FacetBucket } from '@/api'

withDefaults(
  defineProps<{
    label: string
    options: FacetBucket[]
    allLabel?: string
  }>(),
  { allLabel: '全部' },
)

const model = defineModel<string>({ default: '' })
</script>

<template>
  <div v-if="options.length > 0" class="filter-row">
    <span class="filter-label">{{ label }}</span>
    <div class="chips">
      <button
        type="button"
        class="chip-btn"
        :class="{ active: model === '' }"
        @click="model = ''"
      >
        {{ allLabel }}
      </button>
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="chip-btn"
        :class="{ active: model === option.value }"
        @click="model = model === option.value ? '' : option.value"
      >
        <span>{{ option.label }}</span>
        <span v-if="option.count > 0" class="chip-num">{{ option.count }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.filter-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 9px 0;
}

.filter-label {
  flex: none;
  width: 40px;
  padding-top: 6px;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--faint);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  border-radius: 999px;
  background: rgb(255 255 255 / 62%);
  color: var(--muted);
  font-size: 11.5px;
  line-height: 1.6;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.chip-btn:hover {
  background: var(--white);
  color: var(--blue-dark);
}

.chip-btn.active {
  background: var(--blue);
  color: #fff;
}

.chip-num {
  font-family: var(--mono);
  font-size: 9.5px;
  opacity: 0.65;
}

.chip-btn.active .chip-num {
  opacity: 0.85;
}

@media (max-width: 640px) {
  .filter-row {
    flex-direction: column;
    gap: 7px;
  }
  .filter-label {
    width: auto;
    padding-top: 0;
  }
}
@media (max-width: 580px) {
  .filter-row { gap: 8px; }
  .filter-label { width: 32px; padding-top: 11px; }
  .chips { min-width: 0; }
  .chip-btn { min-height: 36px; padding-inline: 10px; font-size: 11px; }
}
</style>
