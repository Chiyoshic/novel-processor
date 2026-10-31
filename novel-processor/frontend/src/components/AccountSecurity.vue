<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '@/stores/auth'
import { notify } from '@/stores/toast'
const { user, logout, changePassword } = useAuth()
const currentPassword = ref(''); const newPassword = ref(''); const confirmation = ref('')
const busy = ref(false); const error = ref('')
async function save(): Promise<void> {
  error.value = ''
  if (newPassword.value.length < 8 || newPassword.value.length > 128) { error.value = '新密码需为 8–128 位'; return }
  if (newPassword.value !== confirmation.value) { error.value = '两次新密码不一致'; return }
  busy.value = true
  try { await changePassword(currentPassword.value, newPassword.value); currentPassword.value = ''; newPassword.value = ''; confirmation.value = ''; notify('密码已修改，请重新登录') }
  catch (err) { error.value = err instanceof Error ? err.message : '修改失败' }
  finally { busy.value = false }
}
async function signOut(): Promise<void> {
  busy.value = true; error.value = ''
  try { await logout() }
  catch (err) { error.value = err instanceof Error ? err.message : '退出失败，请重试' }
  finally { busy.value = false }
}
</script>
<template>
  <section class="account-panel"><header class="account-head"><div><h2>账户安全</h2><p>当前账户 · {{ user?.username }}</p></div><button class="pill pill--ghost pill--small" type="button" :disabled="busy" @click="signOut">退出登录</button></header><form @submit.prevent="save"><fieldset :disabled="busy"><label>当前密码<input v-model="currentPassword" type="password" name="current-password" autocomplete="current-password" maxlength="128" required /></label><label>新密码<input v-model="newPassword" type="password" name="new-password" autocomplete="new-password" minlength="8" maxlength="128" required /></label><label>确认新密码<input v-model="confirmation" type="password" name="confirm-password" autocomplete="new-password" minlength="8" maxlength="128" required /></label></fieldset><p class="security-note">修改密码后，所有设备的登录会话将失效。</p><p v-if="error" class="account-error" role="alert">{{ error }}</p><button class="pill" type="submit" :disabled="busy">{{ busy ? '处理中…' : '修改密码' }}</button></form></section>
</template>
<style scoped>
.account-panel { min-width: 0; padding: 26px; background: var(--white); color: var(--ink); border-radius: var(--radius-lg); box-shadow: var(--shadow-soft); }.account-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; flex-wrap: wrap; }h2 { font-size: 23px; }.account-head p { margin-top: 8px; color: var(--muted); font-size: 13px; }form { margin-top: 28px; max-width: 520px; }fieldset { border: 0; margin: 0; padding: 0; min-width: 0; display: grid; gap: 18px; }label { display: grid; gap: 8px; color: var(--muted); font-size: 13px; }input { min-width: 0; width: 100%; min-height: 50px; padding: 12px 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--paper); color: var(--ink); font: inherit; font-size: 16px; }input:focus-visible { outline: 2px solid var(--blue-dark); outline-offset: 2px; }.security-note { margin: 16px 0 22px; font-size: 12px; line-height: 1.8; color: var(--muted); }.account-error { margin: 16px 0; padding: 12px; border-radius: 14px; background: var(--blue-soft); font-size: 13px; line-height: 1.8; }form > .pill { justify-content: center; }
@media(max-width:580px) { .account-panel { padding: 22px 16px; }form > .pill { width: 100%; } }
</style>
