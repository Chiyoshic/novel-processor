<script setup lang="ts">
import { useAuth } from '@/stores/auth'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { RouterLink } from 'vue-router'
const { user } = useAuth()
</script>

<template>
  <header class="site-header section-wrap">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 6.8C9.8 5.1 7.1 4.5 4.2 4.8c-.8.1-1.4.8-1.4 1.6v11c0 .9.7 1.5 1.5 1.4 2.8-.3 5.4.3 7.7 1.9 2.3-1.6 4.9-2.2 7.7-1.9.8.1 1.5-.5 1.5-1.4v-11c0-.8-.6-1.5-1.4-1.6-2.9-.3-5.6.3-7.8 2Z" />
          <path d="M12 6.8v13.9" />
        </svg>
      </span>
      <span class="brand-name">novel<span>processor</span></span>
    </div>

    <div class="header-actions">
      <RouterLink v-if="user" class="settings-link" to="/settings" aria-label="设置" title="设置">
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
  flex: none;
  background: transparent;
  color: var(--blue-dark);
}

.brand-mark svg {
  display: block;
  width: 30px;
  height: 30px;
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
  .brand-mark { width: 30px; height: 30px; }
  .brand-mark svg { width: 28px; height: 28px; }
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
