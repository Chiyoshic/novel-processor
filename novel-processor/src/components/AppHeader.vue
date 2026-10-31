<script setup lang="ts">
import type { SiteInfo } from '@/lib'

defineProps<{
  sites: SiteInfo[]
  online: boolean
}>()
</script>

<template>
  <header class="site-header section-wrap">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <path d="M4 5.5h6a2 2 0 0 1 2 2V19a1.6 1.6 0 0 0-1.6-1.6H4z" />
          <path d="M20 5.5h-6a2 2 0 0 0-2 2V19a1.6 1.6 0 0 1 1.6-1.6H20z" />
        </svg>
      </span>
      <span class="brand-name">novel<span>processor</span></span>
    </div>

    <div class="header-meta">
      <span class="eyebrow eyebrow--faint">Supported</span>
      <span class="site-list">
        <span v-for="site in sites" :key="site.id" class="chip">{{ site.name }}</span>
      </span>
    </div>

    <div class="header-state" :class="{ 'is-offline': !online }">
      <span class="status-dot" :class="{ 'status-dot--live': online }" />
      <span>{{ online ? '本地数据已连接' : '数据未就绪' }}</span>
    </div>
  </header>
</template>

<style scoped>
.site-header {
  height: 84px;
  display: flex;
  align-items: center;
  gap: 28px;
  position: relative;
  z-index: 10;
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 11px;
  background: var(--blue);
  color: #fff;
  box-shadow: 0 8px 18px rgb(106 158 205 / 28%);
}

.brand-mark svg {
  width: 19px;
  height: 19px;
}

.brand-name {
  font-family: var(--display);
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.045em;
}

.brand-name span {
  color: var(--blue-dark);
}

.header-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

.site-list {
  display: flex;
  gap: 6px;
}

.header-state {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 15px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgb(255 255 255 / 60%);
  color: var(--muted);
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.header-state.is-offline {
  border-color: rgb(214 158 158 / 45%);
  background: rgb(214 158 158 / 10%);
  color: #9c6a6a;
}

.header-state.is-offline .status-dot {
  background: #c98d8d;
  box-shadow: 0 0 0 4px rgb(201 141 141 / 16%);
}

@media (max-width: 900px) {
  .header-meta {
    display: none;
  }
  .header-state {
    margin-left: auto;
    font-size: 10px;
  }
}

@media (max-width: 580px) {
  .site-header {
    height: 72px;
  }
  .brand-name {
    font-size: 15px;
  }
}
</style>
