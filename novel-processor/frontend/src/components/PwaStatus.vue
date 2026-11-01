<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
const installation = ref<InstallPrompt | null>(null)
const installing = ref(false)
const updating = ref(false)
const error = ref('')
const offline = ref(!navigator.onLine)
let registration: ServiceWorkerRegistration | undefined
let updateTimer: ReturnType<typeof setInterval> | undefined
const { needRefresh, updateServiceWorker } = useRegisterSW({
  immediate: true,
  onRegisteredSW(_url, value) { registration = value },
  onRegisterError(error) { console.warn('[pwa] Registration unavailable:', error instanceof Error ? error.message : 'unknown error') },
})
const visible = computed(() => needRefresh.value || installation.value || offline.value)
function beforeInstall(event: Event): void { event.preventDefault(); installation.value = event as InstallPrompt }
function installed(): void { installation.value = null }
function networkChanged(): void { offline.value = !navigator.onLine; if (!offline.value) checkUpdate() }
function checkUpdate(): void { if (navigator.onLine && document.visibilityState === 'visible') void registration?.update().catch(() => {}) }
async function install(): Promise<void> {
  const event = installation.value
  if (!event || installing.value) return
  installing.value = true; error.value = ''
  try { await event.prompt(); await event.userChoice; installation.value = null }
  catch { error.value = '暂时无法安装，请使用浏览器菜单添加到主屏幕。' }
  finally { installing.value = false }
}
async function update(): Promise<void> {
  updating.value = true; error.value = ''
  try { await updateServiceWorker(true) }
  catch { error.value = '更新失败，请稍后重试。' }
  finally { updating.value = false }
}
function dismiss(): void { needRefresh.value = false; installation.value = null; error.value = '' }
onMounted(() => {
  window.addEventListener('beforeinstallprompt', beforeInstall)
  window.addEventListener('appinstalled', installed)
  window.addEventListener('online', networkChanged)
  window.addEventListener('offline', networkChanged)
  document.addEventListener('visibilitychange', checkUpdate)
  updateTimer = setInterval(checkUpdate, 60 * 60 * 1000)
})
onUnmounted(() => {
  window.removeEventListener('beforeinstallprompt', beforeInstall)
  window.removeEventListener('appinstalled', installed)
  window.removeEventListener('online', networkChanged)
  window.removeEventListener('offline', networkChanged)
  document.removeEventListener('visibilitychange', checkUpdate)
  if (updateTimer) clearInterval(updateTimer)
})
</script>
<template>
  <aside v-if="visible" class="pwa-status" aria-label="应用安装与更新">
    <div><p>{{ offline ? '当前处于离线状态' : needRefresh ? '新版本已准备好' : '将书架安装到设备' }}</p><small>{{ offline ? '可打开已缓存的应用界面；登录、书籍内容和翻译仍需联网。' : needRefresh ? '更新会重新加载页面，请先完成当前操作。' : '独立窗口打开，更方便阅读。' }}</small><small v-if="error" role="alert">{{ error }}</small></div>
    <div v-if="!offline" class="pwa-actions"><button v-if="needRefresh" class="pill pill--small" type="button" :disabled="updating" @click="update">{{ updating ? '更新中…' : '更新并刷新' }}</button><button v-else class="pill pill--small" type="button" :disabled="installing" @click="install">安装</button><button class="pill pill--ghost pill--small" type="button" :disabled="updating || installing" @click="dismiss">稍后</button></div>
  </aside>
</template>
<style scoped>
.pwa-status { position: fixed; right: max(20px, env(safe-area-inset-right)); bottom: max(20px, env(safe-area-inset-bottom)); z-index: 90; display: flex; flex-wrap: wrap; align-items: center; gap: 16px; max-width: min(480px, calc(100vw - 40px)); padding: 18px 20px; border-radius: 20px; border: 1px solid var(--line); background: var(--white); color: var(--ink); box-shadow: var(--shadow-soft); }
.pwa-status p { font-size: 14px; line-height: 1.8; }.pwa-status small { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; line-height: 1.8; }.pwa-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-left: auto; }
@media print { .pwa-status { display: none; } }
</style>
