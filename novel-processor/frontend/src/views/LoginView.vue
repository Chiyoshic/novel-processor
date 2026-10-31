<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/stores/auth'
import { safeReturnPath } from '@/lib/auth-client'
const route = useRoute(); const router = useRouter(); const { login } = useAuth()
const username = ref(''); const password = ref(''); const busy = ref(false); const showPassword = ref(false)
const error = ref(route.query.reason === 'unavailable' ? '暂时无法连接登录服务，请稍后重试。' : '')
async function submit(): Promise<void> {
  if (busy.value) return
  busy.value = true; error.value = ''
  try { await login(username.value.trim(), password.value); password.value = ''; await router.replace(safeReturnPath(route.query.redirect)) }
  catch (err) { error.value = err instanceof Error ? err.message : '登录失败' }
  finally { busy.value = false }
}
</script>
<template>
  <main class="login-page section-wrap"><section class="login-card" aria-labelledby="login-title"><p class="eyebrow">Personal Library</p><h1 id="login-title">登录书架</h1><form @submit.prevent="submit"><fieldset :disabled="busy"><label>用户名<input v-model="username" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="64" required /></label><label>密码<div class="password-field"><input v-model="password" name="password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" maxlength="128" required /><button type="button" :aria-pressed="showPassword" @click="showPassword = !showPassword">{{ showPassword ? '隐藏' : '显示' }}</button></div></label></fieldset><p v-if="error" class="form-error" role="alert">{{ error }}</p><button class="pill login-submit" type="submit" :disabled="busy || !username.trim() || !password">{{ busy ? '正在登录…' : '登录' }}<span aria-hidden="true">↗</span></button></form><p class="login-note">私人书库 · 暂不开放注册</p></section></main>
</template>
<style scoped>
.login-page { flex: 1; display: grid; place-items: center; padding-block: 36px 70px; }.login-card { width: min(100%,440px); padding: 36px; border-radius: 28px; background: var(--white); color: var(--ink); box-shadow: var(--shadow-soft); border: 1px solid var(--line); }h1 { font-size: 28px; margin-top: 12px; letter-spacing: 0; }form { margin-top: 28px; }fieldset { display: grid; gap: 20px; padding: 0; margin: 0; border: 0; min-width: 0; }label { display: grid; gap: 9px; font-size: 13px; color: var(--muted); }input { width: 100%; min-width: 0; min-height: 50px; padding: 12px 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--paper); color: var(--ink); font: inherit; font-size: 16px; }input:focus-visible { outline: 2px solid var(--blue-dark); outline-offset: 2px; }.password-field { display: flex; align-items: center; position: relative; }.password-field input { padding-right: 64px; }.password-field button { position: absolute; right: 8px; padding: 10px; border: 0; background: transparent; font: inherit; font-size: 12px; color: var(--blue-dark); cursor: pointer; }.login-submit { width: 100%; justify-content: center; min-height: 48px; margin-top: 26px; gap: 14px; }.form-error { padding: 12px 14px; border-radius: 14px; background: var(--blue-soft); color: var(--ink); font-size: 13px; line-height: 1.8; margin-top: 18px; }.login-note { margin-top: 24px; text-align: center; font-size: 12px; color: var(--muted); }
@media(max-width:580px) { .login-page { padding-block: 20px 40px; }.login-card { padding: 28px 22px; border-radius: 24px; }h1 { font-size: 26px; } }
</style>
