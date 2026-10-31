<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SiteInfo } from '@/lib'
import AppSelect from '@/components/AppSelect.vue'
import type { SelectOption } from '@/components/select-option'

const props = defineProps<{
  sites: SiteInfo[]
  busy: boolean
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  submit: [payload: { input: string; site: string }]
}>()

const input = ref('')

const siteOptions = computed<SelectOption[]>(() =>
  props.sites.map((site) => ({
    value: site.id,
    label: site.name,
    hint: site.hosts[0] ?? site.id,
  })),
)

const site = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
})

function submit(): void {
  const value = input.value.trim()
  if (!value || props.busy) return
  emit('submit', { input: value, site: props.modelValue })
}
</script>

<template>
  <section class="import-band">
    <div class="import-inner section-wrap">
      <form class="import-form" @submit.prevent="submit">
        <AppSelect
          v-model="site"
          label="数据来源"
          :options="siteOptions"
          :disabled="busy || siteOptions.length === 0"
        />

        <div class="input-shell">
          <input
            v-model="input"
            type="text"
            inputmode="url"
            spellcheck="false"
            placeholder="作品地址或作品 ID"
            aria-label="作品地址或作品 ID"
            :disabled="busy"
          />
          <button class="pill" type="submit" :disabled="busy || !input.trim()">
            <span>{{ busy ? '解析中…' : '添加作品' }}</span>
            <span class="pill__arrow" aria-hidden="true">↗</span>
          </button>
        </div>
      </form>
    </div>
  </section>
</template>

<style scoped>
.import-band {
  position: relative;
  padding: 18px 20px 20px;
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  background: rgb(255 255 255 / 46%);
}

.import-inner {
  position: relative;
  width: 100%;
}

.import-form {
  display: flex;
  align-items: center;
  gap: 10px;
}

.input-shell {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  padding: 4px 4px 4px 18px;
  border-radius: 999px;
  background: var(--white);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.input-shell:focus-within {
  box-shadow: 0 10px 26px rgb(49 83 105 / 9%);
}

.input-shell input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--ink);
}

.input-shell input::placeholder {
  color: #a9b6bd;
}

@media (max-width: 720px) {
  .import-form {
    flex-direction: column;
    align-items: stretch;
  }
  .input-shell {
    padding-left: 16px;
  }
}

@media (max-width: 580px) {
  .import-band {
    padding: 14px 16px 16px;
  }
  .input-shell {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 0;
    background: transparent;
  }
  .input-shell:focus-within {
    box-shadow: none;
  }
  .input-shell input {
    flex: none;
    width: 100%;
    min-height: 42px;
    padding: 0 15px;
    border-radius: 999px;
    background: var(--white);
    font-size: 14px;
  }
  .input-shell input:focus {
    box-shadow: 0 10px 26px rgb(49 83 105 / 9%);
  }
  .input-shell .pill {
    width: 100%;
    min-height: 42px;
    justify-content: space-between;
    font-size: 13px;
  }
}
</style>
