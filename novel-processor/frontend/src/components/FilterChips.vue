<script setup lang="ts">
import type { FacetBucket } from '@/api'

withDefaults(
  defineProps<{
    label: string
    options: FacetBucket[]
    allLabel?: string
    hideLabel?: boolean
    collapsible?: boolean
  }>(),
  { allLabel: '全部', hideLabel: false, collapsible: false },
)

const model = defineModel<string>({ default: '' })
const expanded = defineModel<boolean>('expanded', { default: true })
</script>

<template>
  <div v-if="options.length > 0" class="filter-row" role="group" :aria-label="label">
    <button v-if="collapsible" class="filter-label filter-label-toggle" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      {{ label }}<span class="filter-label-chevron" :class="{ 'is-expanded': expanded }" aria-hidden="true" />
    </button>
    <span v-else-if="!hideLabel" class="filter-label">{{ label }}</span>
    <div v-show="!collapsible || expanded" class="chips">
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
  width: 64px;
  white-space: nowrap;
  padding-top: 6px;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.filter-label-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  padding-inline: 0;
  padding-bottom: 0;
  border: 0;
  background: transparent;
  font-weight: 400;
  line-height: normal;
  text-align: left;
  cursor: pointer;
}
.filter-label-chevron {
  flex: none;
  width: 9px;
  height: 9px;
  background: var(--blue-dark);
  -webkit-mask: url('/icons/chevron.down.svg') center / contain no-repeat;
  mask: url('/icons/chevron.down.svg') center / contain no-repeat;
}
.filter-label-chevron.is-expanded { -webkit-mask-image: url('/icons/chevron.up.svg'); mask-image: url('/icons/chevron.up.svg'); }

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 6px;
  padding: 5px 11px;
  border-radius: 999px;
  background: var(--chip-bg);
  color: var(--chip-ink);
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
@media (max-width: 720px) {
  .filter-row { gap: 6px; padding: 7px 0; }
  .filter-label { width: auto; padding-top: 7px; font-size: 10px; }
  .chips { min-width: 0; gap: 6px; }
  .chip-btn {
    height: 42px;
    min-height: 42px;
    padding: 0 11px;
    border-radius: 999px;
    font-size: 14px;
    line-height: 1;
  }
}
</style>
