<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  busy: boolean
}>()

const emit = defineEmits<{ submit: [input: string] }>()

const value = ref('')

function submit() {
  const input = value.value.trim()
  if (!input || props.busy) return
  emit('submit', input)
}

function useExample() {
  value.value = 'https://ncode.syosetu.com/n4703ix/'
}
</script>

<template>
  <section class="import-band">
    <div class="grid-deco" />
    <div class="import-inner section-wrap">
      <div class="import-copy">
        <p class="eyebrow">01 / Import</p>
        <h1>把连载，<em>收进自己的书架</em>。</h1>
        <p class="import-intro">
          粘贴作品地址或作品 ID，解析元数据、章节目录与更新时间。
          正文按话拆分落盘，中断可续传。
        </p>
      </div>

      <form class="import-form" @submit.prevent="submit">
        <div class="input-shell">
          <span class="input-prefix" aria-hidden="true">URL</span>
          <input
            v-model="value"
            type="text"
            inputmode="url"
            spellcheck="false"
            placeholder="https://ncode.syosetu.com/n4703ix/"
            aria-label="作品地址或作品 ID"
            :disabled="busy"
          />
          <button class="pill" type="submit" :disabled="busy || !value.trim()">
            <span>{{ busy ? '解析中…' : '添加作品' }}</span>
            <span class="pill__arrow" aria-hidden="true">↗</span>
          </button>
        </div>
        <div class="import-hint">
          <span class="eyebrow eyebrow--faint">Try</span>
          <button class="link" type="button" @click="useExample">n4703ix</button>
          <span class="dot-sep">·</span>
          <span class="muted">支持裸 ID、作品页地址、单话地址</span>
        </div>
      </form>
    </div>
  </section>
</template>

<style scoped>
.import-band {
  position: relative;
  padding: 58px 0 62px;
  border-bottom: 1px solid var(--line);
  overflow: hidden;
}

.import-band::after {
  content: '';
  position: absolute;
  top: -220px;
  right: -80px;
  width: 520px;
  height: 520px;
  border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, #dff0fa 0%, rgb(169 205 226 / 55%) 38%, transparent 68%);
  opacity: 0.7;
  pointer-events: none;
}

.import-inner {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 440px);
  gap: 56px;
  align-items: end;
}

.import-copy h1 {
  margin-top: 18px;
  font-size: clamp(38px, 5vw, 62px);
  line-height: 1.02;
  max-width: 560px;
}

.import-copy h1 em {
  font-style: normal;
  color: var(--blue);
}

.import-intro {
  margin-top: 20px;
  max-width: 400px;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.8;
}

.import-form {
  padding-bottom: 4px;
}

.input-shell {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 8px 8px 18px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgb(255 255 255 / 82%);
  box-shadow: var(--shadow-soft);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.input-shell:focus-within {
  background: var(--white);
  border-color: rgb(106 158 205 / 55%);
  box-shadow: 0 18px 40px rgb(49 83 105 / 12%);
}

.input-prefix {
  font-family: var(--mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--blue-dark);
  background: var(--blue-soft);
  border-radius: 6px;
  padding: 5px 7px;
  flex: none;
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

.import-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding-left: 20px;
  font-size: 11px;
}

.link {
  border: 0;
  background: none;
  padding: 0;
  color: var(--blue-dark);
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  border-bottom: 1px solid rgb(63 113 156 / 35%);
}

.link:hover {
  border-color: var(--blue-dark);
}

.dot-sep {
  color: #c3d0d6;
}

@media (max-width: 900px) {
  .import-band {
    padding: 40px 0 44px;
  }
  .import-inner {
    grid-template-columns: 1fr;
    gap: 28px;
  }
  .import-copy h1 {
    font-size: clamp(32px, 8vw, 44px);
  }
  .import-form {
    padding-bottom: 0;
  }
}

@media (max-width: 580px) {
  .input-shell {
    flex-wrap: wrap;
    border-radius: 20px;
    padding: 12px;
  }
  .input-prefix {
    display: none;
  }
  .input-shell input {
    flex: 1 1 100%;
    padding: 6px 6px 10px;
    font-size: 13px;
  }
  .input-shell .pill {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
