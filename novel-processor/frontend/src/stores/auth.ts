import { readonly, ref } from 'vue'
import type { AuthUser } from '@shared/auth'
import { AuthClient } from '@/lib/auth-client'
import { normalizeApiBase } from '@/lib/api-base'

const base = normalizeApiBase(import.meta.env.VITE_API_BASE)
export const authClient = new AuthClient(base, {
  lock: (work) => typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request(`novel-processor-auth:${base}`, work) : work(),
})
const user = ref<AuthUser | null>(null)
authClient.subscribe(() => { user.value = authClient.user })
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('novel-processor-auth') : null
channel?.addEventListener('message', (event: MessageEvent<unknown>) => { if (event.data === 'logout') authClient.invalidate() })
export function useAuth() {
  return {
    user: readonly(user),
    login: (username: string, password: string) => authClient.login(username, password),
    logout: async () => { await authClient.logout(); channel?.postMessage('logout') },
    changePassword: async (current: string, next: string) => { await authClient.changePassword(current, next); channel?.postMessage('logout') },
  }
}
