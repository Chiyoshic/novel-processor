<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { readerStyle } from '@/lib/reader-preferences'
import AppHeader from '@/components/AppHeader.vue'
import AppToast from '@/components/AppToast.vue'
import { useAuth } from '@/stores/auth'
import { useSites } from '@/stores/sites'

const route = useRoute()
const isReading = computed(() => route.name === 'reader')
const { load } = useSites()

const { user } = useAuth()
watch(user, (value) => { if (value) void load() }, { immediate: true })
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--reading': isReading }" :style="isReading ? readerStyle : undefined">
    <AppHeader />

    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>

    <footer class="site-footer section-wrap">
      <span class="footer-name">novel<span>processor</span></span>
      <span class="footer-note">仅供个人阅读整理，请遵守各站点使用条款。</span>
    </footer>

    <AppToast />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
}

.site-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: auto;
  padding: 26px 0 max(24px, env(safe-area-inset-bottom));
}

.footer-name {
  font-family: var(--display);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.04em;
}

.footer-name span {
  color: var(--blue-dark);
}

.footer-note {
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.04em;
  color: #a4b0b5;
}

.page-enter-active,
.page-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.page-leave-to {
  opacity: 0;
}

@media (max-width: 580px) {
  .site-footer {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}
</style>
