<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import type { EpisodeContent } from '@/lib'

const props = defineProps<{
  open: boolean
  loading: boolean
  error: string | null
  content: EpisodeContent | null
  novelTitle: string
  hasPrev: boolean
  hasNext: boolean
}>()

const emit = defineEmits<{
  close: []
  prev: []
  next: []
  fetchOne: []
}>()

function onKey(event: KeyboardEvent): void {
  if (!props.open) return
  if (event.key === 'Escape') emit('close')
  if (event.key === 'ArrowLeft' && props.hasPrev) emit('prev')
  if (event.key === 'ArrowRight' && props.hasNext) emit('next')
}

watch(
  () => props.open,
  (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
  },
)

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <Transition name="reader">
    <div v-if="open" class="reader-root" role="dialog" aria-modal="true" aria-label="正文阅读">
      <div class="reader-backdrop" @click="emit('close')" />

      <aside class="reader-panel">
        <header class="reader-head">
          <div class="head-text">
            <p class="eyebrow">{{ novelTitle }}</p>
            <h3>{{ content ? content.title : loading ? '读取中…' : '尚未下载' }}</h3>
          </div>
          <button class="close-btn" type="button" aria-label="关闭" @click="emit('close')">✕</button>
        </header>

        <div class="reader-body scroll-area">
          <div v-if="loading" class="reader-state">
            <span class="loading-bar" />
            <p class="muted">正在读取正文…</p>
          </div>

          <div v-else-if="error" class="reader-state">
            <p class="state-title">{{ error }}</p>
            <button class="pill pill--small" type="button" @click="emit('fetchOne')">
              <span>立即下载这一话</span>
              <span class="pill__arrow" aria-hidden="true">↗</span>
            </button>
          </div>

          <article v-else-if="content" class="novel-text">
            <div v-if="content.preface" class="block preface">{{ content.preface }}</div>
            <div class="block main">{{ content.body }}</div>
            <div v-if="content.afterword" class="block afterword">{{ content.afterword }}</div>
          </article>
        </div>

        <footer class="reader-foot">
          <button class="pill pill--ghost pill--small" type="button" :disabled="!hasPrev" @click="emit('prev')">
            <span aria-hidden="true">←</span>
            <span>上一话</span>
          </button>
          <span class="foot-meta">
            <span v-if="content">{{ content.body.length.toLocaleString('en-US') }} 字</span>
            <span v-if="content?.totalEpisodes"> · 共 {{ content.totalEpisodes }} 话</span>
          </span>
          <button class="pill pill--ghost pill--small" type="button" :disabled="!hasNext" @click="emit('next')">
            <span>下一话</span>
            <span aria-hidden="true">→</span>
          </button>
        </footer>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.reader-root {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  justify-content: flex-end;
}

.reader-backdrop {
  position: absolute;
  inset: 0;
  background: rgb(23 38 49 / 26%);
  backdrop-filter: blur(3px);
}

.reader-panel {
  position: relative;
  width: min(620px, 100%);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--white);
  box-shadow: -30px 0 70px rgb(23 38 49 / 16%);
}

.reader-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 26px 30px 20px;
  border-bottom: 1px solid var(--line);
}

.head-text h3 {
  margin-top: 10px;
  font-family: var(--display);
  font-size: 21px;
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1.3;
}

.close-btn {
  flex: none;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--paper);
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.close-btn:hover {
  background: var(--white);
  border-color: rgb(106 158 205 / 50%);
  color: var(--blue-dark);
}

.reader-body {
  flex: 1;
  padding: 32px 34px 40px;
  min-height: 0;
}

.reader-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 60px 0;
  text-align: center;
}

.state-title {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.7;
}

.loading-bar {
  display: block;
  height: 3px;
  width: 64px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, var(--blue), transparent);
  animation: sweep 1.4s ease-in-out infinite;
}

@keyframes sweep {
  0%, 100% { opacity: 0.25; transform: scaleX(0.6); }
  50% { opacity: 1; transform: scaleX(1); }
}

.novel-text {
  max-width: 640px;
}

.block {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 15px;
  line-height: 2;
  color: #2b3b46;
  letter-spacing: 0.01em;
}

.block + .block {
  margin-top: 32px;
}

.preface,
.afterword {
  font-size: 13px;
  line-height: 1.9;
  color: var(--muted);
  padding: 18px 20px;
  border-radius: var(--radius-md);
  background: var(--paper);
}

.preface {
  border-left: 2px solid rgb(106 158 205 / 45%);
}

.afterword {
  border-left: 2px solid #d9e2e7;
}

.reader-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 30px 20px;
  border-top: 1px solid var(--line);
  background: rgb(245 248 249 / 70%);
}

.foot-meta {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--faint);
}

.reader-enter-active,
.reader-leave-active {
  transition: opacity 0.25s ease;
}

.reader-enter-active .reader-panel,
.reader-leave-active .reader-panel {
  transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
}

.reader-enter-from,
.reader-leave-to {
  opacity: 0;
}

.reader-enter-from .reader-panel,
.reader-leave-to .reader-panel {
  transform: translateX(28px);
}

@media (max-width: 580px) {
  .reader-head {
    padding: 20px 20px 16px;
  }
  .reader-body {
    padding: 24px 20px 30px;
  }
  .reader-foot {
    padding: 14px 20px 16px;
  }
  .block {
    font-size: 14px;
    line-height: 1.95;
  }
}
</style>
