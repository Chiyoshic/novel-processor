<script setup lang="ts">
import type { LibraryEntry } from '@/api'

defineProps<{
  entries: LibraryEntry[]
  selectedKey: string | null
  loading: boolean
}>()

const emit = defineEmits<{ select: [entry: LibraryEntry] }>()

function keyOf(entry: LibraryEntry): string {
  return `${entry.site}/${entry.novelId}`
}

function percent(entry: LibraryEntry): number {
  if (entry.episodeCount === 0) return 0
  return Math.round((entry.downloaded / entry.episodeCount) * 100)
}
</script>

<template>
  <aside class="shelf">
    <div class="shelf-head">
      <p class="eyebrow">02 / Shelf</p>
      <span class="shelf-count">{{ entries.length }}</span>
    </div>

    <div v-if="loading" class="shelf-empty">
      <span class="loading-bar" />
      <p class="muted">读取本地书库…</p>
    </div>

    <div v-else-if="entries.length === 0" class="shelf-empty">
      <p class="empty-title">书架是空的</p>
      <p class="muted">在上方粘贴作品地址，解析后会自动出现在这里。</p>
    </div>

    <ul v-else class="shelf-list scroll-area">
      <li v-for="entry in entries" :key="keyOf(entry)">
        <button
          class="shelf-item"
          :class="{ selected: keyOf(entry) === selectedKey }"
          type="button"
          @click="emit('select', entry)"
        >
          <span class="item-top">
            <span class="item-title">{{ entry.title }}</span>
          </span>
          <span class="item-author">{{ entry.author || '未知作者' }}</span>
          <span class="item-foot">
            <span class="item-bar" aria-hidden="true">
              <span class="item-bar-fill" :style="{ width: `${percent(entry)}%` }" />
            </span>
            <span class="item-ratio">{{ entry.downloaded }}/{{ entry.episodeCount }}</span>
          </span>
        </button>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.shelf {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 22px 18px 18px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 42%);
}

.shelf-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 16px;
  border-bottom: 1px solid var(--line);
}

.shelf-count {
  display: grid;
  place-items: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--blue-soft);
  color: var(--blue-dark);
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 700;
}

.shelf-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0 2px 0 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 62vh;
}

.shelf-empty {
  padding: 28px 6px;
  text-align: center;
}

.shelf-empty p {
  font-size: 12px;
  line-height: 1.7;
}

.empty-title {
  font-family: var(--display);
  font-size: 14px !important;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 6px;
}

.loading-bar {
  display: block;
  height: 3px;
  width: 64px;
  margin: 0 auto 14px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, var(--blue), transparent);
  animation: sweep 1.4s ease-in-out infinite;
}

@keyframes sweep {
  0%, 100% { opacity: 0.25; transform: scaleX(0.6); }
  50% { opacity: 1; transform: scaleX(1); }
}

.shelf-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
  padding: 12px 13px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}

.shelf-item:hover {
  background: rgb(255 255 255 / 76%);
  border-color: var(--line);
}

.shelf-item.selected {
  background: var(--white);
  border-color: rgb(106 158 205 / 45%);
  box-shadow: 0 10px 24px rgb(49 83 105 / 8%);
}

.item-top {
  display: flex;
  align-items: flex-start;
}

.item-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--ink);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.item-author {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--faint);
}

.item-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.item-bar {
  flex: 1;
  height: 3px;
  border-radius: 999px;
  background: #e4edf2;
  overflow: hidden;
}

.item-bar-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--blue);
  transition: width 0.4s ease;
}

.item-ratio {
  font-family: var(--mono);
  font-size: 9px;
  color: var(--faint);
  flex: none;
}

.shelf-item.selected .item-ratio {
  color: var(--blue-dark);
}

@media (max-width: 1024px) {
  .shelf-list {
    max-height: none;
  }
}
</style>
