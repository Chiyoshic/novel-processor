<script setup lang="ts">
import ThemeToggle from '@/components/ThemeToggle.vue'
import { RouterLink } from 'vue-router'
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

    <div class="header-actions">
      <RouterLink class="settings-link" to="/settings" aria-label="设置" title="设置">
<span class="settings-icon" aria-hidden="true" />
      </RouterLink>
      <ThemeToggle />
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.settings-link {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: var(--muted);
  transition: background 0.2s ease, color 0.2s ease;
}

.settings-link:hover {
  background: var(--blue-soft);
  color: var(--blue-dark);
}

.settings-icon {
  display: block;
  width: 18px;
  height: 18px;
  background: currentColor;
  -webkit-mask: url('/gear.svg') center / contain no-repeat;
  mask: url('/gear.svg') center / contain no-repeat;
}


@media (max-width: 580px) {
  .site-header {
    height: 72px;
  }
  .brand-name {
    font-size: 15px;
  }
}
@media (max-width: 380px) {
  .site-header { gap: 10px; }
  .brand { gap: 8px; }
  .header-actions { gap: 0; }
  .brand-name { font-size: 13px; }
}
</style>
